function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showCopyFeedback();
    }).catch(err => {
        console.error('复制失败:', err);
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showCopyFeedback();
        } catch (e) {
            console.error('降级复制方案失败', e);
        }
        document.body.removeChild(textArea);
    });
}

function showCopyFeedback() {
    const feedback = document.getElementById('copyFeedback');
    if (feedback) {
        feedback.classList.add('show');
        setTimeout(() => {
            feedback.classList.remove('show');
        }, 2000);
    }
}

function getBaseUrl() {
    return `${window.location.protocol}//${window.location.host}`;
}

// --- API文档静态结构 ---
const apiDocumentationStructure = [
    {
        category: "媒体API",
        containerId: "basicApis",
        apis: [
            { method: "GET", path: "/api/v1/media/picture/random", description: "获取随机图片（所有目录）" },
            { method: "GET", path: "/api/v1/media/video/random", description: "获取随机视频（所有目录）" },
            { method: "GET", path: "/api/v1/media/picture/by-dir/{目录名}", description: "获取指定目录的随机图片", dynamicKey: "pictureDirs" },
            { method: "GET", path: "/api/v1/media/video/by-dir/{目录名}", description: "获取指定目录的随机视频", dynamicKey: "videoDirs" },
            { method: "GET", path: "/api/v1/media/picture/by-category/{分类名}", description: "获取指定分类的随机图片", dynamicKey: "pictureCategories" },
            { method: "GET", path: "/api/v1/media/video/by-category/{分类名}", description: "获取指定分类的随机视频", dynamicKey: "videoCategories" },
        ]
    },
    {
        category: "智能壁纸API",
        containerId: "directoryApis", // Note: Using old container IDs for compatibility with HTML
        apis: [
            { method: "GET", path: "/api/v1/wallpaper/smart", description: "智能匹配壁纸，可附带w和h参数", example: "/api/v1/wallpaper/smart?w=1920&h=1080" },
            { method: "GET", path: "/api/v1/wallpaper/by-ratio/{比例}", description: "获取指定比例的壁纸", params: { "比例": "ultrawide, widescreen, standard, portrait, square" }, dynamicKey: "wallpaperRatios" },
        ]
    },
    {
        category: "信息查询API",
        containerId: "infoApis",
        apis: [
            { method: "GET", path: "/api/v1/info/lists", description: "获取所有可用目录、分类和别名信息" },
            { method: "GET", path: "/api/v1/info/stats", description: "获取API调用统计" },
            { method: "GET", path: "/api/v1/info/logs", description: "获取最近API调用记录", params: { "limit": "返回记录条数 (默认50)" }, example: "/api/v1/info/logs?limit=10" },
            { method: "GET", path: "/api/v1/info/dir-stats", description: "获取目录访问统计" },
            { method: "GET", path: "/api/v1/info/status", description: "获取数据库和服务状态" },
            { method: "GET", path: "/api/v1/info/category/{type}/{category}", description: "获取指定分类下的目录列表", params: { "type": "picture 或 video" }, example: "/api/v1/info/category/picture/三次元" },
        ]
    }
];


// --- 渲染函数 ---
function renderApiEndpoint(api, listsData) {
    const baseUrl = getBaseUrl();
    let html = `
        <div class="api-endpoint">
            <div class="method-path">
                <span class="method">${api.method}</span>
                <span class="path">${api.path}</span>
            </div>
            <div class="description">${api.description}</div>`;

    if (api.params) {
        html += '<h4 style="color: #4a5568; margin: 1rem 0 0.5rem 0;">参数说明：</h4><ul style="margin-left: 1.5rem; color: #666;">';
        for (const [param, desc] of Object.entries(api.params)) {
            html += `<li><strong>${param}</strong>: ${desc}</li>`;
        }
        html += '</ul>';
    }

    const examples = [];
    if (api.example) {
        examples.push({ url: api.example, description: "示例URL" });
    }

    if (api.dynamicKey && listsData) {
        const key = api.dynamicKey;
        let items = [];
        if (key === 'wallpaperRatios') {
            items = ['ultrawide', 'widescreen', 'standard', 'portrait', 'square'];
        } else if (listsData[key]) {
            items = Array.isArray(listsData[key]) ? listsData[key] : Object.keys(listsData[key]);
        }

        items.slice(0, 3).forEach(item => {
            const url = api.path.replace(/\{(.+?)\}/, encodeURIComponent(item));
            examples.push({ url, description: `获取 "${item}"` });
        });
    }

    if (examples.length > 0) {
        html += '<div class="examples"><h4 style="color: #4a5568; margin: 1rem 0 0.5rem 0;">示例：</h4>';
        examples.forEach(example => {
            const fullUrl = baseUrl + example.url;
            html += `
                <div class="example">
                    <div class="example-url" onclick="copyToClipboard('${fullUrl}')">${fullUrl}</div>
                    <div class="example-desc">${example.description}</div>
                </div>`;
        });
        html += '</div>';
    }

    html += '</div>';
    return html;
}

function renderStats(listsData) {
    const container = document.getElementById('statsContainer');
    if (!container || !listsData) return;
    const stats = {
        totalPictureDirectories: Object.keys(listsData.pictureDirs || {}).length,
        totalVideoDirectories: Object.keys(listsData.videoDirs || {}).length,
        totalPictureCategories: Object.keys(listsData.pictureCategories || {}).length,
        totalVideoCategories: Object.keys(listsData.videoCategories || {}).length,
    };
    container.innerHTML = `
        <div class="stat-card"><span class="stat-number">${stats.totalPictureDirectories}</span><div class="stat-label">图片目录</div></div>
        <div class="stat-card"><span class="stat-number">${stats.totalVideoDirectories}</span><div class="stat-label">视频目录</div></div>
        <div class="stat-card"><span class="stat-number">${stats.totalPictureCategories}</span><div class="stat-label">图片分类</div></div>
        <div class="stat-card"><span class="stat-number">${stats.totalVideoCategories}</span><div class="stat-label">视频分类</div></div>
    `;
}

// --- 主加载函数 ---
async function loadApiDocs() {
    try {
        const res = await fetch('/api/v1/info/lists');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const listsData = await res.json();

        renderStats(listsData);

        apiDocumentationStructure.forEach(section => {
            const container = document.getElementById(section.containerId);
            if (container) {
                container.innerHTML = section.apis.map(api => renderApiEndpoint(api, listsData)).join('');
            }
        });

    } catch (error) {
        console.error('❌ 加载API文档失败:', error);
        ['basicApis', 'directoryApis', 'infoApis', 'statsContainer'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.innerHTML = '<div class="error">❌ 加载失败，请检查服务器连接</div>';
        });
    }
}

document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('statsContainer')) { // Only run on docs page
        loadApiDocs();

        //平滑滚动到锚点
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }
});
