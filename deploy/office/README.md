# Drive Office preview

The API and Drive worker stage immutable source files and calculate a SHA256 content version. ONLYOFFICE Docs renders Word, Excel and PowerPoint in view mode. PDF uses the same ONLYOFFICE read-only viewer and source queue. Original cloud files are never changed; there is no Office writeback endpoint.

## Local setup

1. Generate a secret with `openssl rand -hex 32`. Set the same `OFFICE_JWT_SECRET` in `deploy/office/.env` and `apps/server/.env`. The example files contain no credentials.
2. Set `OFFICE_PUBLIC_URL=http://localhost:8088` and `OFFICE_SOURCE_ORIGIN=http://host.docker.internal:3000` in the server environment. The second URL must be reachable **from the document-server container**. In production, use the internal API service address.
3. Run `pnpm --filter @neozebra/server db:migrate`, then `docker compose --env-file deploy/office/.env -f deploy/office/compose.yaml up -d`.
4. Start or restart the API and Drive worker (`pnpm dev`, or `pnpm dev:worker`). An API-only deployment cannot prepare Office sources.
5. Use the same persistent `DRIVE_PREVIEW_DIRECTORY` volume for API and worker. Source snapshots expire after one hour and are cleaned by the worker every minute. Source read tickets expire after 15 minutes; reopen the dialog to create a fresh session.

The Compose deployment binds ONLYOFFICE to loopback port 8088, pins the verified multi-architecture image digest and enables JWT. In production provide an HTTPS reverse proxy with WebSocket forwarding, persistent volumes, resource monitoring, and the fonts used in your documents. Private-IP access is enabled for the signed internal source URL; metadata-IP access remains disabled. Keep the document server off an unauthenticated public network.

## Formats and limitations

- PDF: read-only, form filling disabled.
- Documents: DOC/DOCX/DOCM, DOT/DOTX/DOTM, ODT/OTT, RTF.
- Spreadsheets: XLS/XLSX/XLSM/XLSB, XLT/XLTX/XLTM, ODS/OTS, CSV.
- Presentations: PPT/PPTX/PPTM, PPS/PPSX/PPSM, POT/POTX/POTM, ODP/OTP.
- Macro execution, plugins, editing, review, comments and form filling are disabled. Download/print/copy remain available to the file owner.
- Specialist formats (Access, Project, OneNote, classic Visio, Outlook messages) need separate readers; they are not advertised as supported Office previews.
- Engine resources, ZIP expansion protections, damaged/encrypted content and missing fonts can affect conversion and fidelity. There is no fixed source file-size limit in the app. `maxDownloadBytes: 0` removes the engine's default 100MiB download threshold; ZIP expansion protections remain. Large conversions can exhaust container resources and should be capacity-tested with representative files.
- Commercial distribution must use an appropriate ONLYOFFICE edition/license. The bundled Community edition has its own AGPL and branding terms; this integration does not change those terms.

The browser loads the official DocsAPI script on demand. Loading, failure and retry remain inside the existing centered Dialog and do not invalidate the directory listing or tree.
