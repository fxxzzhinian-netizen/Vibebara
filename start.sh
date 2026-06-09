#!/bin/bash
# Vibebara - 统一启动脚本 (Linux/macOS)
# 后台进程启动前后端，彩色日志输出

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
GRAY='\033[0;90m'
NC='\033[0m' # 无颜色

echo ""
echo -e "${CYAN}========================================================${NC}"
echo -e "${CYAN}   Vibebara - AI 协作中台启动器${NC}"
echo -e "${CYAN}========================================================${NC}"
echo ""

cleanup() {
    echo ""
    echo -e "${YELLOW}正在停止所有服务...${NC}"
    [ -n "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null && echo -e "  ${GRAY}后端 (PID $BACKEND_PID) 已停止${NC}"
    [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null && echo -e "  ${GRAY}前端 (PID $FRONTEND_PID) 已停止${NC}"
    wait $BACKEND_PID 2>/dev/null
    wait $FRONTEND_PID 2>/dev/null
    echo -e "${GREEN}所有服务已停止${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM

# --- 环境检查 ---
echo -e "${YELLOW}[检查] 环境依赖...${NC}"
echo ""

PYTHON=$(command -v python3 || command -v python || echo "")
if [ -z "$PYTHON" ]; then
    echo -e "  ${RED}[错误] 未找到 Python，请安装 Python 3.10+${NC}"
    exit 1
fi
echo -e "  ${GREEN}[OK] Python: $($PYTHON --version 2>&1)${NC}"

if ! command -v node &>/dev/null; then
    echo -e "  ${RED}[错误] 未找到 Node.js，请安装 Node.js 18+${NC}"
    exit 1
fi
echo -e "  ${GREEN}[OK] Node.js: $(node --version)${NC}"
echo -e "  ${GREEN}[OK] npm: $(npm --version)${NC}"
echo ""

# --- 后端准备 ---
echo -e "${YELLOW}[准备] 配置后端环境...${NC}"
cd "$ROOT/backend"

if [ ! -d ".venv" ]; then
    echo -e "  ${GRAY}创建 Python 虚拟环境...${NC}"
    $PYTHON -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt -q 2>/dev/null
echo -e "  ${GREEN}[OK] 后端依赖已就绪${NC}"
echo ""

# --- 前端准备 ---
echo -e "${YELLOW}[准备] 配置前端环境...${NC}"
cd "$ROOT/frontend"

if [ ! -d "node_modules" ]; then
    echo -e "  ${GRAY}安装前端依赖...${NC}"
    npm install --silent
fi
echo -e "  ${GREEN}[OK] 前端依赖已就绪${NC}"
echo ""

# --- 启动后端 ---
echo -e "${MAGENTA}==========================================${NC}"
echo -e "${MAGENTA}  启动后端 (FastAPI + Uvicorn)${NC}"
echo -e "${MAGENTA}==========================================${NC}"
echo -e "  ${GRAY}工作目录: $ROOT/backend${NC}"
echo -e "  ${GRAY}命令: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000${NC}"
echo -e "  地址: ${GREEN}http://localhost:8000${NC}"
echo -e "  API 文档: ${GREEN}http://localhost:8000/docs${NC}"
echo ""

cd "$ROOT/backend"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 2>&1 | sed "s/^/  [后端] /" &
BACKEND_PID=$!
echo -e "  ${GRAY}后端 PID: $BACKEND_PID${NC}"
echo ""

# --- 启动前端 ---
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}  启动前端 (Vite Dev Server)${NC}"
echo -e "${GREEN}==========================================${NC}"
echo -e "  ${GRAY}工作目录: $ROOT/frontend${NC}"
echo -e "  ${GRAY}命令: npm run dev${NC}"
echo -e "  地址: ${GREEN}http://localhost:5173${NC}"
echo ""

cd "$ROOT/frontend"
npm run dev 2>&1 | sed "s/^/  [前端] /" &
FRONTEND_PID=$!
echo -e "  ${GRAY}前端 PID: $FRONTEND_PID${NC}"
echo ""

# --- 就绪 ---
sleep 2
echo ""
echo -e "${CYAN}========================================================${NC}"
echo -e "${GREEN}  所有服务已启动!${NC}"
echo ""
echo -e "  前端: ${GREEN}http://localhost:5173${NC}"
echo -e "  后端: ${GREEN}http://localhost:8000${NC}"
echo -e "  API:  ${GREEN}http://localhost:8000/docs${NC}"
echo ""
echo -e "  ${GRAY}按 Ctrl+C 停止所有服务${NC}"
echo -e "${CYAN}========================================================${NC}"
echo ""

wait
