# IMEI photo reading

The shared ProductIntakeForm supports image upload and native phone camera capture for Smartphone products. Photos are decoded and recognized in the browser; OCR worker, WASM and English data are served from /ocr on the same origin. No photo-upload API or third-party OCR service is used.

Results are staged for review. The operator can correct each number and choose Use these IMEIs. Empty results do not overwrite existing fields. Cancelling/discarding/category changes cancel recognition and release the preview. Invalid files, unsupported formats, no matches and timeouts show recoverable messages. Barcode and manual input remain available.

Local assets are generated automatically by predev/prebuild from pinned npm dependencies. The source schema and backend creation rules are unchanged by this feature.

Verification:
- TypeScript passed.
- 11 focused tests passed (IMEI parser and product API).
- Actual Chrome OCR recognized both labelled IMEIs in a synthetic dark-screen image, excluded the serial, and filled fields only after review.
- Actual Chrome OCR checked IMEI2-only image preserving existing IMEI1; no-match and invalid-image handling; cancellation without stale results.
- No external browser requests occurred during photo OCR. No inventory records were created in these checks.
- Mobile screenshot reviewed; no horizontal overflow or runtime exceptions.
- Physical phone camera capture and the original chat attachment were not end-to-end tested.

OCR integration reference: https://github.com/naptha/tesseract.js/blob/master/docs/api.md
