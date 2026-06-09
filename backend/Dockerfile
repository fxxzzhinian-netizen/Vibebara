# Vibebara 后端镜像（cloud 模式 / 方案 A：镜像内自构建 skill-forge dist）
#
# 关键点：
#   1. 后端在 cloud 模式下用子进程调 `node` 跑 skill-forge 桥，故镜像同时含 Python + Node 20。
#   2. skill-forge 在镜像内 `npm ci && npm run build` 现构建 dist，再 prune 掉 dev 依赖，
#      仓库无需提交任何构建产物（dist / node_modules 均可被 .gitignore 忽略）。
#   3. 国内云服务器网络受限：Debian apt 走腾讯云内网镜像、Node 走 npmmirror、
#      pip 走清华、npm 走 npmmirror。非腾讯云环境构建时用 --build-arg APT_MIRROR= 覆盖
#      （留空则保持官方 deb.debian.org）。
#   4. WS 广播为进程内内存态 → 单进程启动（--workers 1），勿横向扩。
FROM python:3.11-slim

# ---- Debian apt 镜像（默认腾讯云内网；置空则用官方源）----
ARG APT_MIRROR=mirrors.tencentyun.com
RUN set -eux; \
    if [ -n "$APT_MIRROR" ]; then \
      sed -i "s/deb.debian.org/$APT_MIRROR/g; s/security.debian.org/$APT_MIRROR/g" \
        /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
      sed -i "s/deb.debian.org/$APT_MIRROR/g; s/security.debian.org/$APT_MIRROR/g" \
        /etc/apt/sources.list 2>/dev/null || true; \
    fi

# ---- Node 20（从 npmmirror 取官方二进制，规避 nodesource 国内不可达）----
ARG NODE_VERSION=20.18.1
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl xz-utils ca-certificates git; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) nodearch=x64 ;; \
      arm64) nodearch=arm64 ;; \
      *) echo "unsupported arch: $arch" && exit 1 ;; \
    esac; \
    curl -fsSL "https://registry.npmmirror.com/-/binary/node/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${nodearch}.tar.xz" -o /tmp/node.tar.xz; \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1; \
    rm /tmp/node.tar.xz; \
    apt-get clean && rm -rf /var/lib/apt/lists/*; \
    node --version && npm --version

WORKDIR /app

# ---- Python 依赖（清华源；先拷 requirements 利用层缓存）----
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# ---- skill-forge：镜像内构建 dist + 仅留生产依赖（npmmirror 源）----
COPY skill-forge ./skill-forge
RUN cd skill-forge \
    && npm config set registry https://registry.npmmirror.com \
    && npm ci \
    && npm run build \
    && npm prune --omit=dev

# ---- 应用代码（.dockerignore 已排除 .venv/node_modules/.env/data/skill-forge 产物）----
COPY . .

ENV DEPLOYMENT_MODE=cloud \
    HOST=0.0.0.0 \
    PORT=8000 \
    COWORK_DATA_DIR=/app/data

EXPOSE 8000

# WS 进程内内存态 → 固定单进程
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
