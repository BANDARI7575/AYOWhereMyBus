"""Bounded verified HTTPS downloads with a real total wall-clock deadline."""
import asyncio
import ssl
from urllib.parse import urlsplit
import aiohttp
import certifi

MAX_FEED_BYTES=8*1024*1024

async def _download(url):
    context=ssl.create_default_context(cafile=certifi.where())
    timeout=aiohttp.ClientTimeout(total=12,connect=3,sock_read=6)
    async with aiohttp.ClientSession(timeout=timeout,trust_env=True,connector=aiohttp.TCPConnector(ssl=context)) as session:
        async with session.get(url,allow_redirects=False) as response:
            if response.status!=200:raise ValueError('Feed response must be HTTP 200')
            chunks=[];size=0
            async for chunk in response.content.iter_chunked(65536):
                size+=len(chunk)
                if size>MAX_FEED_BYTES:raise ValueError('Transit feed exceeds size limit')
                chunks.append(chunk)
            return b''.join(chunks)

def fetch_feed(url):
    parts=urlsplit(url)
    if parts.scheme!='https' or not parts.hostname or parts.username or parts.password:
        raise ValueError('Transit feeds require credential-free HTTPS URLs')
    return asyncio.run(_download(url))
