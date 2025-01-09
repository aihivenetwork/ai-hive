import asyncio
import logging
import os
import urllib.parse
from logging import LogRecord, getLogger
from pathlib import Path
from typing import Any, Awaitable, Callable

import fsspec  # type: ignore
from aiohttp import web
from fsspec.asyn import AsyncFileSystem  # type: ignore
from fsspec.core import split_protocol  # type: ignore
from pydantic_core import to_jsonable_python

from aihive._display import display
from aihive._util.constants import DEFAULT_SERVER_HOST, DEFAULT_VIEW_PORT
from aihive._util.file import filesystem, size_in_mb
from aihive.log._file import (
    EvalLogInfo,
    eval_log_json,
    list_eval_logs_async,
    read_eval_log_async,
    read_eval_log_headers_async,
)

from .notify import view_last_eval_time

logger = getLogger(__name__)

def view_server(
    log_dir: str,
    recursive: bool = True,
    host: str = DEFAULT_SERVER_HOST,
    port: int = DEFAULT_VIEW_PORT,
    authorization: str | None = None,
    fs_options: dict[str, Any] = {},
) -> None:
    routes = web.RouteTableDef()
    fs = filesystem(log_dir)
    
    if not fs.exists(log_dir):
        fs.mkdir(log_dir, True)
    log_dir = fs.info(log_dir).get("name", log_dir)
    
    def validate_log_file_request(log_file: str) -> None:
        if not authorization and (not log_file.startswith(log_dir) or ".." in log_file):
            raise web.HTTPUnauthorized()

    @routes.get("/api/logs/{log}")
    async def api_log(request: web.Request) -> web.Response:
        file = urllib.parse.unquote(request.match_info["log"])
        validate_log_file_request(file)
        header_only = request.query.get("header-only", None)
        return await log_file_response(file, header_only)

    @routes.get("/api/log-size/{log}")
    async def api_log_size(request: web.Request) -> web.Response:
        file = urllib.parse.unquote(request.match_info["log"])
        validate_log_file_request(file)
        return await log_size_response(file)

    @routes.get("/api/log-delete/{log}")
    async def api_log_delete(request: web.Request) -> web.Response:
        file = urllib.parse.unquote(request.match_info["log"])
        validate_log_file_request(file)
        return await log_delete_response(file)

    @routes.get("/api/log-bytes/{log}")
    async def api_log_bytes(request: web.Request) -> web.Response:
        file = urllib.parse.unquote(request.match_info["log"])
        validate_log_file_request(file)
        start = request.query.get("start")
        end = request.query.get("end")
        
        if start is None or end is None:
            return web.HTTPBadRequest(reason="Missing 'start' or 'end' query parameter")
        
        return await log_bytes_response(file, int(start), int(end))

    @routes.get("/api/logs")
    async def api_logs(request: web.Request) -> web.Response:
        request_log_dir = request.query.getone("log_dir", log_dir) if authorization else log_dir
        request_log_dir = urllib.parse.unquote(request_log_dir)
        logs = await list_eval_logs_async(request_log_dir, recursive, fs_options)
        return log_listing_response(logs, request_log_dir)

    @routes.get("/api/log-headers")
    async def api_log_headers(request: web.Request) -> web.Response:
        files = [urllib.parse.unquote(f) for f in request.query.getall("file", [])]
        list(map(validate_log_file_request, files))
        return await log_headers_response(files)

    @routes.get("/api/events")
    async def api_events(request: web.Request) -> web.Response:
        last_eval_time = request.query.get("last_eval_time", None)
        actions = ["refresh-evals"] if last_eval_time and view_last_eval_time() > int(last_eval_time) else []
        return web.json_response(actions)

    @web.middleware
    async def authorize(request: web.Request, handler: Callable[[web.Request], Awaitable[web.StreamResponse]]) -> web.StreamResponse:
        if request.headers.get("Authorization") != authorization:
            return web.HTTPUnauthorized()
        return await handler(request)

    app = web.Application(middlewares=[authorize] if authorization else [])
    app.router.add_routes(routes)
    app.router.register_resource(WWWResource())
    filter_aiohttp_log()

    display().print(f"aihive View: {log_dir}")
    web.run_app(app=app, host=host, port=port, print=display().print, access_log_format='%a %t "%r" %s %b (%Tf)', shutdown_timeout=1)

def log_listing_response(logs: list[EvalLogInfo], log_dir: str) -> web.Response:
    response = {
        "log_dir": aliased_path(log_dir),
        "files": [{"name": log.name, "size": log.size, "mtime": log.mtime, "task": log.task, "task_id": log.task_id} for log in logs]
    }
    return web.json_response(response)

async def log_file_response(file: str, header_only_param: str | None) -> web.Response:
    header_only_mb = int(header_only_param) if header_only_param else None
    header_only = resolve_header_only(file, header_only_mb)
    
    try:
        if header_only:
            try:
                log = await read_eval_log_async(file, header_only=True)
                contents = eval_log_json(log)
            except ValueError as ex:
                logger.info(f"Failed to read headers from {file}: {ex}. Reading full file.")
                log = await read_eval_log_async(file, header_only=False)
                contents = eval_log_json(log)
        else:
            log = await read_eval_log_async(file, header_only=False)
            contents = eval_log_json(log)

        return web.Response(body=contents, content_type="application/json")
    except Exception as error:
        logger.exception(error)
        return web.Response(status=500, reason="File processing error")

async def log_size_response(log_file: str) -> web.Response:
    fs = filesystem(log_file)
    info = await fs.info(log_file) if fs.is_async() else fs.info(log_file)
    return web.json_response({"size": info["size"]})

async def log_delete_response(log_file: str) -> web.Response:
    fs = filesystem(log_file)
    fs.rm(log_file)
    return web.json_response(True)

async def log_bytes_response(log_file: str, start: int, end: int) -> web.Response:
    content_length = end - start + 1
    headers = {"Content-Type": "application/octet-stream", "Content-Length": str(content_length)}
    fs = filesystem(log_file)
    data = await async_connection(log_file)._cat_file(log_file, start=start, end=end + 1) if fs.is_async() else fs.read_bytes(log_file, start, end + 1)
    return web.Response(status=200, body=data, headers=headers)

async def log_headers_response(files: list[str]) -> web.Response:
    headers = await read_eval_log_headers_async(files)
    return web.json_response(to_jsonable_python(headers, exclude_none=True))

class WWWResource(web.StaticResource):
    def __init__(self) -> None:
        super().__init__("", os.path.abspath((Path(__file__).parent / "www" / "dist").as_posix()))

    async def _handle(self, request: web.Request) -> web.StreamResponse:
        if not request.match_info["filename"]:
            request.match_info["filename"] = "index.html"
        response = await super()._handle(request)
        response.headers.update({
            "Expires": "Fri, 01 Jan 1990 00:00:00 GMT",
            "Pragma": "no-cache",
            "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate"
        })
        return response

def aliased_path(path: str) -> str:
    home_dir = os.path.expanduser("~")
    return path.replace(home_dir, "~", 1) if path.startswith(home_dir) else path

def resolve_header_only(path: str, header_only: int | None) -> bool:
    return header_only == 0 or (header_only is not None and size_in_mb(path) > int(header_only))

def filter_aiohttp_log() -> None:
    class RequestFilter(logging.Filter):
        def filter(self, record: LogRecord) -> bool:
            return "/api/events" not in record.getMessage()

    access_logger = getLogger("aiohttp.access")
    if not any(isinstance(f, RequestFilter) for f in access_logger.filters):
        access_logger.addFilter(RequestFilter())

_async_connections: dict[str, AsyncFileSystem] = {}

def async_connection(log_file: str) -> AsyncFileSystem:
    protocol, _ = split_protocol(log_file) or ("file",)
    if protocol not in _async_connections:
        _async_connections[protocol] = fsspec.filesystem(protocol, asynchronous=True, loop=asyncio.get_event_loop())
    return _async_connections[protocol]
