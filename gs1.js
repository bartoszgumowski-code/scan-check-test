/* Scan Check: turns raw barcode text into plain-language fields (GS1 AIs, GTIN, NVE/SSCC). No DOM access here. */
(function (root) {
  "use strict";
  var GS = "\u001d";

  var AIS = {
    "00": { n: "NVE / SSCC (pallet number)", len: 18, check: true },
    "01": { n: "GTIN (product number)", len: 14, check: true },
    "02": { n: "GTIN of the items inside", len: 14, check: true },
    "10": { n: "Charge / batch", max: 20 },
    "11": { n: "Production date", len: 6, date: true },
    "12": { n: "Due date", len: 6, date: true },
    "13": { n: "Packing date", len: 6, date: true },
    "15": { n: "Best before (MHD)", len: 6, date: true },
    "16": { n: "Sell by", len: 6, date: true },
    "17": { n: "Expiry date", len: 6, date: true },
    "20": { n: "Variant", len: 2 },
    "21": { n: "Serial number", max: 20 },
    "22": { n: "Consumer product variant", max: 20 },
    "30": { n: "Count (variable)", max: 8 },
    "37": { n: "Count of items inside", max: 8 },
    "240": { n: "Extra product ID", max: 30 },
    "241": { n: "Customer part number", max: 30 },
    "400": { n: "Customer order number", max: 30 },
    "401": { n: "Consignment number", max: 30 },
    "402": { n: "Shipment ID", len: 17 },
    "403": { n: "Routing code", max: 30 },
    "410": { n: "Ship to (GLN)", len: 13, check: true },
    "411": { n: "Bill to (GLN)", len: 13, check: true },
    "412": { n: "Purchased from (GLN)", len: 13, check: true },
    "413": { n: "Ship for (GLN)", len: 13, check: true },
    "414": { n: "Physical location (GLN)", len: 13, check: true },
    "420": { n: "Ship-to postal code", max: 20 },
    "422": { n: "Country of origin", len: 3 },
    "7003": { n: "Expiry date and time", len: 10 },
    "8008": { n: "Production date and time", max: 12 }
  };

  function aiSpec(code) {
    if (AIS[code]) return AIS[code];
    var m = /^3([13])0(\d)$/.exec(code);
    if (m) return { n: (m[1] === "1" ? "Net weight" : "Gross weight") + " (kg)", len: 6, dec: +m[2] };
    return null;
  }

  function checkDigit(body) {
    var t = 0;
    for (var i = 0; i < body.length; i++) {
      t += +body.charAt(body.length - 1 - i) * (i % 2 === 0 ? 3 : 1);
    }
    return (10 - (t % 10)) % 10;
  }
  function validCheck(num) {
    return /^\d{2,}$/.test(num) && checkDigit(num.slice(0, -1)) === +num.slice(-1);
  }
  function fmtDate(v) {
    if (!/^\d{6}$/.test(v)) return v;
    var y = 2000 + +v.slice(0, 2), mm = +v.slice(2, 4), dd = +v.slice(4, 6);
    if (mm < 1 || mm > 12) return v;
    if (dd === 0) dd = new Date(y, mm, 0).getDate();
    return String(dd).padStart(2, "0") + "." + String(mm).padStart(2, "0") + "." + y;
  }

  function parseGS1(raw) {
    var s = String(raw).trim(), out = [];
    if (/^\(\d{2,4}\)/.test(s)) {
      var re = /\((\d{2,4})\)([^(]*)/g, m, last = 0;
      while ((m = re.exec(s))) {
        if (m.index !== last) return null;
        last = re.lastIndex;
        var sp0 = aiSpec(m[1]);
        if (!sp0) return null;
        out.push({ ai: m[1], v: m[2].replace(/\s+$/, ""), sp: sp0 });
      }
      return last === s.length && out.length ? out : null;
    }
    s = s.replace(/^\][A-Za-z]\d/, "").replace(/^\u001d+/, "");
    var i = 0;
    while (i < s.length) {
      if (s.charAt(i) === GS) { i++; continue; }
      var ai = null, sp = null;
      for (var L = 2; L <= 4; L++) {
        var c = s.substr(i, L);
        if (c.length !== L || !/^\d+$/.test(c)) break;
        var t = aiSpec(c);
        if (t) { ai = c; sp = t; break; }
      }
      if (!sp) return null;
      i += ai.length;
      var v;
      if (sp.len) {
        v = s.substr(i, sp.len);
        if (v.length !== sp.len) return null;
        i += sp.len;
      } else {
        var j = s.indexOf(GS, i);
        if (j < 0) j = s.length;
        v = s.slice(i, j);
        i = j;
        if (!v.length || v.length > sp.max) return null;
      }
      out.push({ ai: ai, v: v, sp: sp });
    }
    return out.length ? out : null;
  }

  function prefixCountry(gtin13) {
    var p = +gtin13.slice(0, 3);
    var R = [
      [0, 19, "USA / Canada"], [20, 29, "internal / in-store number"], [30, 39, "USA"], [40, 49, "internal / in-store number"],
      [50, 59, "coupon"], [60, 139, "USA / Canada"], [200, 299, "internal / in-store number"], [300, 379, "France"],
      [400, 440, "Germany"], [450, 459, "Japan"], [490, 499, "Japan"], [500, 509, "United Kingdom"],
      [540, 549, "Belgium / Luxembourg"], [570, 579, "Denmark"], [590, 590, "Poland"], [640, 649, "Finland"],
      [690, 699, "China"], [700, 709, "Norway"], [730, 739, "Sweden"], [760, 769, "Switzerland"],
      [800, 839, "Italy"], [840, 849, "Spain"], [870, 879, "Netherlands"], [900, 919, "Austria"],
      [977, 977, "magazine (ISSN)"], [978, 979, "book (ISBN)"]
    ];
    for (var k = 0; k < R.length; k++) if (p >= R[k][0] && p <= R[k][1]) return R[k][2];
    return null;
  }

  var FORMAT_NAMES = {
    EAN13: "EAN-13", EAN8: "EAN-8", UPCA: "UPC-A", UPCE: "UPC-E", Code128: "Code 128", Code39: "Code 39",
    Code93: "Code 93", ITF: "ITF", ITF14: "ITF-14", Codabar: "Codabar", QRCode: "QR code", MicroQRCode: "Micro QR",
    RMQRCode: "rMQR code", DataMatrix: "Data Matrix", PDF417: "PDF417", MicroPDF417: "MicroPDF417", Aztec: "Aztec",
    DataBar: "GS1 DataBar", DataBarExpanded: "GS1 DataBar Expanded", DataBarLimited: "GS1 DataBar Limited",
    DXFilmEdge: "DX film edge", MaxiCode: "MaxiCode", TYPED: "Typed / handheld scanner"
  };

  function fieldFromAI(a) {
    var f = { ai: "(" + a.ai + ")", label: a.sp.n, value: a.v, note: "", ok: null };
    if (a.sp.date) { f.value = fmtDate(a.v); f.note = "Raw: " + a.v + " (YYMMDD)"; }
    if (a.sp.dec !== undefined) {
      f.value = (+a.v / Math.pow(10, a.sp.dec)).toLocaleString("de-DE", { minimumFractionDigits: a.sp.dec, maximumFractionDigits: a.sp.dec }) + " kg";
    }
    if (a.sp.check) f.ok = validCheck(a.v);
    if (a.ai === "00") f.note = "Search this NVE in Reybex (Artikel-Auskunft WCO11 or stock list).";
    if (a.ai === "01" || a.ai === "02") {
      f.note = a.v.charAt(0) === "0"
        ? "Same as EAN-13 " + a.v.slice(1) + ". Look it up in the Artikelstamm (BAS02)."
        : "Starts with " + a.v.charAt(0) + ": a carton or outer pack level (GTIN-14).";
    }
    if (a.ai === "10") f.note = "This is the Charge to book in Reybex.";
    if (a.ai === "37") f.note = "Number of units (often cartons) on this pallet or in this pack.";
    return f;
  }

  function interpret(raw, format, symbologyId) {
    var text = String(raw).replace(/[\r\n]+$/, "");
    var sym = symbologyId || "";
    var res = { raw: text, format: format, formatName: FORMAT_NAMES[format] || format || "Barcode", gs1: false, title: "", summary: "", fields: [], tip: "" };
    var digits = /^\d+$/.test(text);
    var gs1Sym = /^\](C1|d2|Q3|e0|J1)/.test(sym);
    var looksGS1 = gs1Sym || /^\(\d{2,4}\)/.test(text) || /^\][A-Za-z]\d/.test(text) || text.indexOf(GS) >= 0;

    var parsed = looksGS1 ? parseGS1(text) : null;
    if (!parsed && digits && text.length >= 16 && !(text.length === 18 && validCheck(text))) {
      var p2 = parseGS1(text);
      if (p2 && p2.every(function (a) { return !a.sp.check || validCheck(a.v); })) parsed = p2;
    }

    if (parsed) {
      res.gs1 = true;
      if (format === "Code128") res.formatName = "GS1-128";
      if (format === "DataMatrix") res.formatName = "GS1 DataMatrix";
      if (format === "QRCode") res.formatName = "GS1 QR code";
      res.fields = parsed.map(fieldFromAI);
      res.segments = parsed;
      var has = {};
      parsed.forEach(function (a) { has[a.ai] = a.v; });
      if (has["00"] && parsed.length === 1) {
        res.title = "Pallet label: NVE only";
        res.summary = "This barcode holds only the pallet number. Product, Charge and quantity are linked to this NVE in the system, or printed in other barcodes on the same label.";
      } else if (has["00"]) {
        res.title = "Pallet label with contents";
        res.summary = "This barcode holds the pallet number plus details about what is on the pallet.";
      } else if (has["02"] || has["37"]) {
        res.title = "Pallet contents";
        res.summary = "Describes what is on the pallet. The NVE is usually in a separate barcode at the bottom of the label.";
      } else {
        res.title = "GS1 data barcode";
        res.summary = "This barcode holds several pieces of data, each starting with a code in brackets (the Application Identifier).";
      }
      if (format === "TYPED" && text.indexOf(GS) < 0 && !/^\(/.test(text) && parsed.length > 1 && parsed.some(function (a) { return !a.sp.len; })) {
        res.tip = "Check: the scanner did not send separators between fields, so a value after a Charge or serial number may be cut wrongly.";
      }
      return res;
    }

    if (digits && [8, 12, 13, 14].indexOf(text.length) >= 0 && validCheck(text)) {
      var g13 = text.length === 14 ? text.slice(1) : text.length === 12 ? "0" + text : text;
      var kind = text.length === 14 ? "GTIN-14" : text.length === 8 ? "GTIN-8" : text.length === 12 ? "GTIN-12 (UPC)" : "GTIN-13 (EAN)";
      res.title = text.length === 14 ? "Carton / outer pack number" : "Product number";
      if (format === "ITF" && text.length === 14) res.formatName = "ITF-14";
      res.summary = "Only identifies the product. There is no Charge, date or price inside this barcode.";
      res.fields.push({ ai: "", label: kind, value: text, note: "Matches the EAN/GTIN field in the Reybex Artikelstamm (BAS02).", ok: true });
      if (text.length === 14) {
        res.fields.push({ ai: "", label: "Packing level", value: text.charAt(0), note: "0 = same as the single unit. 1 to 8 = a carton or case of that product.", ok: null });
        if (text.charAt(0) !== "0") res.fields.push({ ai: "", label: "Single-unit EAN-13 (likely)", value: text.slice(1, 13) + checkDigit(text.slice(1, 13)), note: "Usually the EAN of one unit inside this carton. Confirm in the Artikelstamm.", ok: null });
      }
      if (text.length !== 8) {
        var c = prefixCountry(g13);
        if (c) res.fields.push({ ai: "", label: "Number registered in", value: c, note: "The prefix shows which GS1 office issued the number, not where the product was made.", ok: null });
      }
      return res;
    }

    if (digits && text.length === 18 && validCheck(text)) {
      res.title = "Probably an NVE / SSCC";
      res.summary = "18 digits with a valid check digit. This looks like a pallet number without the (00) prefix.";
      res.fields.push({ ai: "", label: "NVE / SSCC", value: text, note: "Search this NVE in Reybex.", ok: true });
      return res;
    }

    if (digits && [8, 12, 13, 14].indexOf(text.length) >= 0) {
      res.title = "Number with a wrong check digit";
      res.summary = "This has the length of a product number, but the last digit does not match. It may be an internal number, or the scan may be wrong.";
      res.fields.push({ ai: "", label: "Value", value: text, note: "Correct last digit would be " + checkDigit(text.slice(0, -1)) + ".", ok: false });
      return res;
    }

    if (/^https?:\/\//i.test(text)) {
      res.title = "Web link";
      res.summary = "This code opens a website.";
      res.fields.push({ ai: "", label: "Link", value: text, note: "", ok: null, link: true });
      return res;
    }

    res.title = "Plain text code";
    res.summary = "No GS1 structure. In the warehouse this is usually a Lagerplatz, an order or document number, or an internal code.";
    res.fields.push({ ai: "", label: "Content", value: text, note: text.length + " characters. Search for it in Reybex.", ok: null });
    return res;
  }

  var api = { interpret: interpret, parseGS1: parseGS1, fmtDate: fmtDate, validCheck: validCheck };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ScanGS1 = api;
})(this);
