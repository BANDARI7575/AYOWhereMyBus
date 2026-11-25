"""Bounded verified HTTPS downloads with a real total wall-clock deadline."""
import asyncio
import ssl
from urllib.parse import urlsplit
import aiohttp
import certifi

MAX_FEED_BYTES=8*1024*1024

async def _download(url, *, trust_env=True, payload=None, max_bytes=MAX_FEED_BYTES, read_timeout=6):
    context=ssl.create_default_context(cafile=certifi.where())
    timeout=aiohttp.ClientTimeout(total=12,connect=3,sock_read=read_timeout)
    async with aiohttp.ClientSession(timeout=timeout,trust_env=trust_env,connector=aiohttp.TCPConnector(ssl=context)) as session:
        method = 'POST' if payload is not None else 'GET'
        async with session.request(method, url, json=payload, allow_redirects=False) as response:
            if response.status!=200:raise ValueError('Feed response must be HTTP 200')
            chunks=[];size=0
            async for chunk in response.content.iter_chunked(65536):
                size+=len(chunk)
                if size>max_bytes:raise ValueError('Response exceeds size limit')
                chunks.append(chunk)
            return b''.join(chunks)

def fetch_feed(url):
    parts=urlsplit(url)
    if parts.scheme!='https' or not parts.hostname or parts.username or parts.password:
        raise ValueError('Transit feeds require credential-free HTTPS URLs')
    return asyncio.run(_download(url))


MCTS_FEEDS = {
    name: f'https://realtime.ridemcts.com/gtfsrt/{name}'
    for name in ('vehicles', 'trips', 'alerts')
}


def fetch_mcts_relay(name):
    if name not in MCTS_FEEDS:
        raise ValueError('Unsupported MCTS feed')
    return asyncio.run(_download(f'http://mcts:8083/feeds/{name}', trust_env=False, read_timeout=9))
