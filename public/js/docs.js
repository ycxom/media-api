
// 复制到剪贴板功能
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showCopyFeedback();
    }).catch(err => {
        console.error('复制失败:', err);
        // 降级方案
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showCopyFeedback();
    });
}

function showCopyFeedback() {
    const feedback = document.getElementById('copyFeedback');
    feedback.classList.add('show');
    setTimeout(() => {
        feedback.classList.remove('show');
    }, 2000);
}

// 获取当前页面的baseUrl
function getBaseUrl() {
    return `${window.location.protocol}//${window.location.host}`;
}

// 渲染API端点
function renderApiEndpoint(api) {
    const baseUrl = getBaseUrl();

    let html = `
                <div class="api-endpoint">
                    <div class="method-path">
                        <span class="method">${api.method}</span>
                        <span class="path">${api.path}</span>
                    </div>
                    <div class="description">${api.description}</div>
            `;

    if (api.parameters) {
        html += '<h4 style="color: #4a5568; margin: 1rem 0 0.5rem 0;">参数说明：</h4>';
        html += '<ul style="margin-left: 1.5rem; color: #666;">';
        for (const [param, desc] of Object.entries(api.parameters)) {
            html += `<li><strong>${param}</strong>: ${desc}</li>`;
        }
        html += '</ul>';
    }

    if (api.example) {
        const fullUrl = baseUrl + api.example;
        html += `
                    <div class="examples">
                        <h4 style="color: #4a5568; margin: 1rem 0 0.5rem 0;">示例：</h4>
                        <div class="example">
                            <div class="example-url" onclick="copyToClipboard('${fullUrl}')">${fullUrl}</div>
                            <div class="example-desc">点击复制URL</div>
                        </div>
                    </div>
                `;
    }

    if (api.examples && api.examples.length > 0) {
        html += '<div class="examples"><h4 style="color: #4a5568; margin: 1rem 0 0.5rem 0;">示例：</h4>';
        api.examples.forEach(example => {
            const fullUrl = baseUrl + example.url;
            html += `
                        <div class="example">
                            <div class="example-url" onclick="copyToClipboard('${fullUrl}')">${fullUrl}</div>
                            <div class="example-desc">${example.description}</div>
                        </div>
                    `;
        });
        html += '</div>';
    }

    if (api.availableDirectories && api.availableDirectories.length > 0) {
        html += `
                    <div style="margin-top: 1rem;">
                        <h4 style="color: #4a5568; margin-bottom: 0.5rem;">可用目录 (${api.availableDirectories.length}个)：</h4>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                `;
        api.availableDirectories.forEach(dir => {
            const url = api.path.includes('picture') ?
                `${baseUrl}/picture/${encodeURIComponent(dir)}` :
                `${baseUrl}/video/${encodeURIComponent(dir)}`;
            html += `<a href="${url}" target="_blank" class="try-button">${dir}</a>`;
        });
        html += '</div></div>';
    }

    if (api.availableCategories && Object.keys(api.availableCategories).length > 0) {
        html += `
                    <div style="margin-top: 1rem;">
                        <h4 style="color: #4a5568; margin-bottom: 0.5rem;">可用分类：</h4>
                        <div class="categories-grid">
                `;
        Object.entries(api.availableCategories).forEach(([category, dirs]) => {
            const url = api.path.includes('picture') ?
                `${baseUrl}/api/random/picture/${encodeURIComponent(category)}` :
                `${baseUrl}/api/random/video/${encodeURIComponent(category)}`;
            html += `
                        <div class="category-card">
                            <div class="category-name">${category}</div>
                            <div class="category-count">${dirs.length} 个目录</div>
                            <a href="${url}" target="_blank" class="try-button">试试看</a>
                        </div>
                    `;
        });
        html += '</div></div>';
    }

    html += '</div>';
    return html;
}

// 渲染统计信息
function renderStats(stats) {
    const container = document.getElementById('statsContainer');
    container.innerHTML = `
                <div class="stat-card">
                    <span class="stat-number">${stats.totalPictureDirectories}</span>
                    <div class="stat-label">图片目录</div>
                </div>
                <div class="stat-card">
                    <span class="stat-number">${stats.totalVideoDirectories}</span>
                    <div class="stat-label">视频目录</div>
                </div>
                <div class="stat-card">
                    <span class="stat-number">${stats.totalPictureCategories}</span>
                    <div class="stat-label">图片分类</div>
                </div>
                <div class="stat-card">
                    <span class="stat-number">${stats.totalVideoCategories}</span>
                    <div class="stat-label">视频分类</div>
                </div>
            `;
}

// 加载API文档
function loadApiDocs() {
    fetch('/api/docs')
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            // 渲染统计信息
            renderStats(data.statistics);

            // 分类映射
            const categoryMap = {
                '基础随机API': 'basicApis',
                '指定目录API': 'directoryApis',
                '分类随机API': 'categoryApis',
                '信息查询API': 'infoApis'
            };

            // 渲染各类API
            data.endpoints.forEach(endpoint => {
                const containerId = categoryMap[endpoint.category];
                if (!containerId) return;

                const container = document.getElementById(containerId);
                if (!container) return;

                let html = '';
                endpoint.apis.forEach(api => {
                    html += renderApiEndpoint(api);
                });

                container.innerHTML = html;
            });
        })
        .catch(error => {
            console.error('❌ 加载API文档失败:', error);
            ['basicApis', 'directoryApis', 'categoryApis', 'infoApis', 'statsContainer'].forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.innerHTML = '<div class="error">❌ 加载失败，请检查服务器连接</div>';
                }
            });
        });
}

// 平滑滚动到锚点
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function () {
    loadApiDocs();
});