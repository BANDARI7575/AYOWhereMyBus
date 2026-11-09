FROM python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b
WORKDIR /app
COPY requirements.txt requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock
COPY . .
RUN useradd --uid 10001 --create-home ayo && mkdir -p /app/instance && chown -R ayo:ayo /app
USER ayo
ENV BIND_HOST=0.0.0.0
EXPOSE 8000
VOLUME ["/app/instance"]
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8000')+'/api/ready',timeout=3).close()"
CMD ["python", "scripts/start_production.py"]
