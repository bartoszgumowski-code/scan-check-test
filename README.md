# glow25 Scan Check

A small web app that reads barcodes with the phone camera and explains what is inside them, in plain words.

**Live app:** see the GitHub Pages link in the repo's About section.

## What it does

- Opens the phone camera and reads a barcode the moment it is in view. It beeps and vibrates when it finds a code.
- Explains the content:
  - **EAN-13 / GTIN:** the product number, check digit, and which GS1 office issued it.
  - **GS1-128 pallet labels and GS1 DataMatrix:** NVE/SSCC (00), GTIN (01/02), Charge (10), best before (15), expiry (17), count (37), weights and more.
  - **ITF-14:** carton number and the likely single-unit EAN.
  - **Plain codes** such as Lagerplatz or document numbers.
- Two modes: stop after each scan, or **Keep scanning** for many labels in a row.
- Torch button on phones that support it.
- Also reads a barcode from a photo, or from a handheld scanner that types into the text field.
- Scan history on the device, with **Download CSV** and **Copy for Excel**.

## Privacy

Everything runs in the browser. No image or code leaves the phone. The history is stored only in that browser (localStorage).

## How to use

1. Open the app link on the phone (Chrome on Android, Safari on iPhone).
2. Tap **Start camera** and allow camera access.
3. Point at the barcode. Hold the phone 10 to 25 cm away.
4. Optional: "Add to Home Screen" to open it like an app.

The camera only works over HTTPS. GitHub Pages provides that.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout and styles |
| `app.js` | Camera, scanning loop, history, export |
| `gs1.js` | Turns barcode text into readable fields (GS1 Application Identifiers, GTIN, NVE) |
| `vendor/zxing-wasm/` | Barcode reader: [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) 3.1.6 (MIT), built on [zxing-cpp](https://github.com/zxing-cpp/zxing-cpp) (Apache-2.0) |

No build step. To run locally: `python3 -m http.server` in this folder, then open `http://localhost:8000`.
