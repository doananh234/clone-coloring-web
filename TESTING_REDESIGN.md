# Testing Redesign API

## Prerequisites

1. **Environment variables** (already set in `.env.development.local`):
   ```bash
   DIAFLOW_API_KEY=sk-9ff415f802144e4c94e93914986e00a6
   DIAFLOW_BUILDER_ID=WswrvzF4Vn
   ```

2. **Local assets exist**: Make sure you have crawled assets in `assets/{listingId}/`:
   - `assets/{listingId}/metadata.json`
   - `assets/{listingId}/pdfs/*.pdf`
   - `assets/{listingId}/images/*.png` (or `.jpg`)

3. **Dev server running**:
   ```bash
   cd petpa-dashboard
   yarn dev
   ```

---

## Method 1: Test via UI (Easiest)

1. **Open the crawler page**:
   ```
   http://localhost:3000/crawler
   ```

2. **Find an asset** in the "Existing crawled assets" table that has:
   - ✅ At least 1 metadata file
   - ✅ At least 1 PDF
   - ✅ At least 1 image

3. **Click "Redesign"** button on that asset row.

4. **In the dialog**:
   - Select metadata file (usually just `metadata.json`)
   - Select thumbnail image (preview will show on the right)
   - Select PDF file
   - Click **"Submit redesign"**

5. **Check browser console** (F12) for the response. You should see:
   ```json
   {
     "success": true,
     "message": "Redesign submitted to Diaflow",
     "diaflow": {
       "sessionId": "ea6b7dfe-79f8-4275-8881-7b4b044ab0ed",
       "status": "Processing",
       ...
     }
   }
   ```

6. **Copy the `sessionId`** from the response.

7. **Check status** (see Method 2 below).

---

## Method 2: Test via API (Manual)

### Step 1: Submit Redesign

Replace `{listingId}`, `{pdfFile}`, `{thumbnailImage}` with actual values from your `assets/` folder:

```bash
curl -X POST http://localhost:3000/api/redesign \
  -H "Content-Type: application/json" \
  -d '{
    "listingId": "68ee0c8cc4369d7d493187b8",
    "metadataFile": "metadata.json",
    "thumbnailImage": "Colorful_Christmas_Coloring_Book_image_1_thumb.png",
    "pdfFile": "Colorful_Christmas_Coloring_Book_digital_edition.pdf"
  }'
```

**Expected response**:
```json
{
  "success": true,
  "message": "Redesign submitted to Diaflow",
  "listingId": "68ee0c8cc4369d7d493187b8",
  "metadataFile": "metadata.json",
  "thumbnailImage": "Colorful_Christmas_Coloring_Book_image_1_thumb.png",
  "pdfFile": "Colorful_Christmas_Coloring_Book_digital_edition.pdf",
  "diaflow": {
    "sessionId": "ea6b7dfe-79f8-4275-8881-7b4b044ab0ed",
    "status": "Processing",
    "createdAt": "2026-02-03T17:15:26.850305",
    "id": "ea6b7dfe-79f8-4275-8881-7b4b044ab0ed"
  }
}
```

**Copy the `sessionId`** from `diaflow.sessionId`.

---

### Step 2: Check Status

Replace `{sessionId}` with the sessionId from Step 1:

```bash
curl http://localhost:3000/api/redesign/status/{sessionId}
```

**Example**:
```bash
curl http://localhost:3000/api/redesign/status/ea6b7dfe-79f8-4275-8881-7b4b044ab0ed
```

**While processing** (status: "Processing"):
```json
{
  "sessionId": "ea6b7dfe-79f8-4275-8881-7b4b044ab0ed",
  "status": "Processing",
  "createdAt": "...",
  "id": "..."
}
```

**When done** (status: "done"):
```json
{
  "sessionId": "ea6b7dfe-79f8-4275-8881-7b4b044ab0ed",
  "status": "done",
  "output": {
    "1770282668853": [
      "https://diaflow-platform-production.s3.us-east-1.amazonaws.com/production/workspace_1361/gallery/user_None/pdf_page_b5a16f.jpeg"
    ],
    "1770282192736": "production/workspace_1361/gallery/user_None/gemini_image_6959e3.png"
  },
  "parsed": {
    "thumbnail": "production/workspace_1361/gallery/user_None/gemini_image_6959e3.png",
    "images": [
      "https://diaflow-platform-production.s3.us-east-1.amazonaws.com/production/workspace_1361/gallery/user_None/pdf_page_b5a16f.jpeg"
    ]
  }
}
```

---

## Method 3: Test Status Polling (Automated)

You can poll the status endpoint until `status === "done"`:

```bash
# Replace {sessionId} with your actual sessionId
SESSION_ID="ea6b7dfe-79f8-4275-8881-7b4b044ab0ed"

while true; do
  RESPONSE=$(curl -s http://localhost:3000/api/redesign/status/$SESSION_ID)
  STATUS=$(echo $RESPONSE | jq -r '.status')
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "done" ]; then
    echo "✅ Done! Result:"
    echo $RESPONSE | jq '.parsed'
    break
  fi
  
  sleep 2
done
```

---

## Troubleshooting

### Error: "DIAFLOW_API_KEY is not configured"
- Check `.env.development.local` has `DIAFLOW_API_KEY=...`
- Restart your dev server after adding env vars

### Error: "File not found" (404)
- Make sure the asset files exist in `assets/{listingId}/pdfs/` and `assets/{listingId}/images/`
- Check the filenames match exactly (case-sensitive)

### Error: "Diaflow process call failed" (502)
- Check your `DIAFLOW_API_KEY` is valid
- Check the builder ID `WswrvzF4Vn` is correct
- Verify Diaflow API is accessible from your server

### Status stays "Processing" forever
- Check Diaflow dashboard/logs for errors
- The process might have failed; check Diaflow's status directly

---

## Next Steps (After Testing)

Once you confirm the API works:

1. **Update Firestore** with the results:
   - Use `parsed.thumbnail` → update listing's thumbnail
   - Use `parsed.images` → update listing's images array

2. **Add polling UI** in `RedesignDialog`:
   - After submit, show "Processing..." with sessionId
   - Poll `/api/redesign/status/{sessionId}` every 2-3 seconds
   - Show "Done!" when status === "done"
   - Display the parsed thumbnail/images

3. **Error handling**:
   - Show errors if Diaflow fails
   - Handle timeout if process takes too long
