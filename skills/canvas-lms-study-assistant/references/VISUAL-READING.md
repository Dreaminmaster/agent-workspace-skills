# Visual reading and OCR

The cloud starter extends the existing read_file tool with visual (boolean), pages (e.g. 1-3 or 2,5), ocr (boolean, default true) and ocr_language (eng or eng+chi_sim). At most three pages per call; use additional explicit page ranges when needed. PDF, PNG, JPEG and WebP are supported. SVG, video and Office embedded graphics are not rendered by this extension; existing DOCX/PPTX text extraction stays available.

Sparse PDF pages can trigger automatic rendering within the first 20 pages. This heuristic cannot establish visual coverage of the whole file. Text-rich pages containing figures should be requested with visual=true. The response records processed pages, pending pages, scan detection scope, OCR confidence and limitations. Do not treat detected text as complete interpretation of a chart.

PDF.js 4.10.38 renders in a fresh, credential-free browser context. Tesseract.js 6.0.1 performs OCR in that browser. The OCR-only copy of a white-paper page is binarized and long table rules removed; returned colour images are untouched. Low confidence (<60) is marked review_required and omitted from merged/indexed text, while remaining available for review. Confidence is not measured character accuracy. Handwriting and unfamiliar notation remain uncertain.

The MCP response contains actual image blocks, not signed public URLs or base64 inside a JSON text block. ChatGPT should inspect these images for photographs, table geometry, diagrams, axes, legends, units and plotted data, and distinguish printed numbers from estimates. Always cite the source Canvas URL and page. The protected Site query page can also show the image evidence.

API-only calls never invoke a browser. For auto reads, already API-authorised bytes can be analysed without an active school SSO session; a course file that needs the independent browser downloader still requires normal school authentication. Failed OCR must retain successful ordinary text reads and expose the real partial status.

## Privacy and operations

The PDF and OCR JS distributions are bundled, with upstream Apache-2.0 licenses in visual-assets. The analysis context has no school cookies. Only GETs to exact versioned OCR core/language asset paths are allowed; queries and arbitrary outgoing headers are blocked. Document bytes stay in the owner's cloud browser and private MCP response. No third-party document OCR/model API or new API key is used. Static language/WASM downloads do not receive document data. Browser quota still applies; no unattended keepalive or continuous retry is introduced.

The analysis has a 65-second budget, four-megapixel render cap, ten-MB file limit and bounded image output. On failure, return text plus explicit unmet coverage. The source case's actual two-page schedule produced two image blocks and OCR confidence 92/93 after preprocessing; photo-background OCR confidence 28 was correctly left for review. These observations do not prove every scan/language/chart or phone client.

The private source passes 97 offline checks; the independently instantiated sanitized starter passes 74. New-owner acceptance must still use their real files, ordinary Chat and iPhone. A fully raster-only source PDF, Chinese OCR, handwritten notes, independent numeric chart accuracy, Office graphics and iPhone image presentation were not separately accepted in the source case.

Run the usual starter instantiation, local dependency setup, tests and private deployment. Text assets are allowed only inside cloud-browser/visual-assets; keep their pinned versions and licenses. Wrangler uses Text module rules for them. The Worker remains below the source account's free compressed-script size cap; no plan upgrade was performed.

Official implementation references: [PDF.js rendering](https://mozilla.github.io/pdf.js/examples/) and [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).

Recovery tasks retain bounded page ranges and OCR language/options, never document bytes or image payloads. A login/quota pause therefore does not lose the selected visual-reading stage.
