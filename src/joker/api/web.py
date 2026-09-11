"""Serve the built React application after API routes, including SPA deep links."""
import os
from pathlib import Path


def mount_web(app):
    from fastapi.responses import FileResponse, JSONResponse
    from starlette.staticfiles import StaticFiles

    dist = Path(os.environ.get("JOKER_WEB_DIST", Path(__file__).resolve().parents[3] / "web" / "dist")).resolve()
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="web-assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        # Unknown APIs and asset names must never return HTML with status 200.
        if path == "api" or path.startswith(("api/", "assets/")) or "." in path or "\\" in path:
            return JSONResponse(status_code=404, content={"error": {"code": "not_found", "message": "요청한 경로가 없습니다."}})
        if not (dist / "index.html").is_file():
            return JSONResponse(status_code=503, content={"error": {
                "code": "web_not_built", "message": "web 폴더에서 npm run build를 실행하세요."}})
        return FileResponse(dist / "index.html", headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "same-origin",
            "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        })
