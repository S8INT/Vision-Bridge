# Native image upload verification

This is the regression checklist for the iOS and Android retinal-image path. It
uses the production upload service and does not add a test-only upload mode or
change the multipart request.

## Prerequisites

- A physical iOS or Android device (a simulator can verify the picker flow, but
  a physical device is preferred for camera and URI coverage).
- Expo Go or the current development build.
- The `artifacts/api-server: API Server` and `artifacts/visionbridge: expo`
  workflows running.
- A test patient selected in the app and a retinal image that is large enough
  for the server quality check.

The API uses its local in-memory image store when MinIO is not configured, so a
development run does not need storage credentials. Do not use production
patient data for this check.

## Run the device check

Run the following on **each platform** that is part of the release.

1. Open **New Screening**, select a test patient, and choose both image sources
   on separate runs:
   - **Camera**: capture a new retinal image.
   - **Gallery**: choose an existing JPEG or PNG.
2. Confirm the quality screen opens for both sources. The image URI should be a
   native URI (`file://` on iOS or `file://`/`content://` on Android), not a
   web `data:` URI.
3. Confirm the native metadata lookup is exercised before upload:
   - The picker asset's `fileSize` field is optional.
   - Repeat the quality check with a picker result where `fileSize` is absent
     (camera/gallery providers commonly differ here). The native branch must
     still return a quality result without an exception; this calls
     `expo-file-system/legacy.getInfoAsync(uri)` and reads the returned
     `exists`/`size` metadata.
   - If the provider always supplies `fileSize`, use the same image URI in a
     development console or temporary local test invocation of
     `checkImageQualityLocally(uri)` with the size argument omitted. Remove any
     temporary invocation after the check.
4. Tap **Upload and Analyze** and record the progress values. The expected
   sequence is:
   - starts at `10`;
   - may emit simulated values between `10` and `74` while the request is
     pending;
   - reaches `80` after the HTTP response;
   - reaches `100` only after the JSON response is parsed.
5. On success, confirm the result contains:
   - a non-empty `imageId`;
   - `storage` set to `local` (development fallback) or `minio`;
   - a positive `sizeBytes`;
   - a DICOM wrapper and thumbnail name;
   - the screen proceeds to analysis instead of showing **Upload Error**.
6. Open the resulting screening and confirm the stored image/thumbnail can be
   fetched. This catches a successful HTTP response with a bad object name or
   URI.

## Failure-path checks

Run these without changing application code:

1. Select an intentionally unusable/very low-quality image and upload it. The
   app should show **Server Quality Check Failed**, offer **Recapture** and
   **Review**, and return to the quality step rather than advancing to
   analysis.
2. Start an upload, then make the API unreachable. The app should show
   **Upload Error**, keep the image available on the quality step, and allow a
   retry. If connectivity is lost before the request begins, the expected
   offline behavior is a queued upload with `storage: "offline-queued"` rather
   than a false success from the server.
3. Verify that a failed retry does not leave the queue item stuck in
   `uploading`; the Upload Queue should show it as failed and expose the retry
   action.

## Repeatable API multipart smoke check

This is a host-side companion check for the same server contract. It does not
replace the device run because it cannot validate native URI handling or the
mobile progress callback.

With the API workflow running, execute from the repository root:

```bash
API_URL="${REPLIT_DEV_DOMAIN:+https://$REPLIT_DEV_DOMAIN}/api"
response_file="$(mktemp)"
status="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
  -F "image=@artifacts/visionbridge/assets/images/retina_placeholder.png;type=image/png" \
  -F "patientId=native-upload-check" \
  -F "deviceId=verification-device" \
  -F "tenantId=verification-tenant" \
  -F "captureTime=2026-01-01T00:00:00.000Z" \
  -F "eye=OD" \
  "$API_URL/imaging/upload")"
node - "$status" "$response_file" <<'NODE'
const fs = require("node:fs");
const [status, file] = process.argv.slice(2);
const body = JSON.parse(fs.readFileSync(file, "utf8"));
if (status === "201") {
  for (const key of ["imageId", "objectName", "thumbnailName", "sizeBytes", "qualityScore", "dicomWrapper", "storage", "uploadedAt"]) {
    if (!(key in body)) throw new Error(`201 response missing ${key}`);
  }
  if (!(body.sizeBytes > 0)) throw new Error("201 response has no image size");
  console.log("PASS: multipart upload returned 201 with image metadata");
} else if (status === "422") {
  if (!body.qualityScore || body.action !== "retake") throw new Error("422 response is missing qualityScore/action");
  console.log("PASS: multipart upload returned expected 422 quality response");
} else {
  throw new Error(`Unexpected upload status ${status}: ${body.error ?? "unknown error"}`);
}
NODE
rm -f "$response_file"
```

The response should be HTTP `201` with JSON fields `imageId`, `objectName`,
`thumbnailName`, `sizeBytes`, `qualityScore`, `dicomWrapper`, `storage`, and
`uploadedAt`. A `422` response is also a valid server response when the
placeholder fails the quality threshold; in that case it must include
`qualityScore` and `action: "retake"`.

To verify the required-field failure response and that the route still parses
multipart requests, omit `patientId`:

```bash
API_URL="${REPLIT_DEV_DOMAIN:+https://$REPLIT_DEV_DOMAIN}/api"
curl --silent --show-error --include \
  -F "image=@artifacts/visionbridge/assets/images/retina_placeholder.png;type=image/png" \
  -F "deviceId=verification-device" \
  -F "tenantId=verification-tenant" \
  "$API_URL/imaging/upload"
```

This request must return HTTP `400` with an error naming the missing required
metadata. The mobile failure-path checks above remain necessary because the
host-side command cannot test React Native's `FormData` file object:
`{ uri, type: "image/jpeg", name: "retinal.jpg" }`.

## Record of a passing run

Record the date, platform/OS, Expo Go or development-build version, image
source (camera/gallery), and the observed progress milestones. A run is
passing only when metadata lookup, multipart upload, success response, and the
relevant failure behavior all pass on the same platform.