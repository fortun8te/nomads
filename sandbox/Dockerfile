FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:1
ENV PYTHONUNBUFFERED=1

# ── System packages ──
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    websockify \
    supervisor \
    socat \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    libxshmfence1 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    libdrm2 \
    libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# ── Python deps ──
COPY requirements.txt /opt/sandbox/requirements.txt
RUN pip3 install --no-cache-dir -r /opt/sandbox/requirements.txt

# ── Install Playwright Chromium (as root so it's shared) ──
RUN playwright install chromium && playwright install-deps chromium

# ── Non-root user ──
RUN useradd -ms /bin/bash sandbox && \
    echo "sandbox ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Make Playwright browsers accessible to sandbox user
RUN chmod -R 755 /root/.cache/ms-playwright || true && \
    cp -r /root/.cache/ms-playwright /home/sandbox/.cache-pw && \
    chown -R sandbox:sandbox /home/sandbox/.cache-pw

ENV PLAYWRIGHT_BROWSERS_PATH=/home/sandbox/.cache-pw

USER sandbox
WORKDIR /home/sandbox

# ── Copy API code ──
COPY --chown=sandbox:sandbox api/ /opt/sandbox/api/
COPY --chown=sandbox:sandbox start-chromium.sh /opt/sandbox/start-chromium.sh
COPY --chown=sandbox:sandbox supervisord.conf /etc/supervisor/conf.d/sandbox.conf

# ── Ports ──
# 8080 = Sandbox FastAPI
# 5900 = VNC (raw)
# 5901 = WebSocket VNC (noVNC connects here)
# 9222 = Chrome CDP (debug)
EXPOSE 8080 5900 5901 9222

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/sandbox.conf"]
