"""Single-node production profile. Bind only behind a trusted TLS ingress."""
import os
bind=os.getenv('BIND_HOST','127.0.0.1')+':'+os.getenv('PORT','8000')
workers=1
worker_class='gthread'
threads=4
timeout=30
graceful_timeout=30
keepalive=5
max_requests=1000
max_requests_jitter=100
accesslog='-'
# Do not log query strings (GPS), peer IPs, cookies, authorization, or report text.
access_log_format='%(m)s %(U)s %(s)s %(L)s'
errorlog='-'
loglevel='info'
forwarded_allow_ips=''
limit_request_line=2048
limit_request_fields=50
limit_request_field_size=4096
umask=0o077
