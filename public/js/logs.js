async function loadData() {
    try {
        // 加载统计数据
        const statsResponse = await fetch('/api/stats');
        const statsData = await statsResponse.json();
        renderStats(statsData);
        
        // 加载目录统计
        const dirResponse = await fetch('/api/directories/stats');
        const dirData = await dirResponse.json();
        renderDirectories(dirData);
        
        // 加载调用记录
        const logsResponse = await fetch('/api/logs?limit=50');
        const logsData = await logsResponse.json();
        renderLogs(logsData);

    } catch (error) {
        console.error('加载数据失败:', error);
        document.getElementById('statsGrid').innerHTML =
            '<div class="error">❌ 加载数据失败</div>';
    }
}

function renderStats(data) {
    const statsGrid = document.getElementById('statsGrid');
    const endpointsTable = document.getElementById('endpointsTable');
    
    // 渲染统计卡片
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${data.overview.totalCalls}</div>
            <div class="stat-label">总调用次数</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${data.overview.runTimeHours}h</div>
            <div class="stat-label">运行时间</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${data.overview.callsPerHour}</div>
            <div class="stat-label">每小时调用</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${formatDisplayTime(data.overview.lastUpdate)}</div>
            <div class="stat-label">最后更新</div>
        </div>
    `;
    
    // 渲染热门端点
    if (data.topEndpoints && data.topEndpoints.length > 0) {
        endpointsTable.innerHTML = data.topEndpoints.map(endpoint => `
            <tr>
                <td><span class="endpoint">${endpoint.endpoint}</span></td>
                <td>${endpoint.calls}</td>
                <td>${endpoint.avgResponseTime}</td>
            </tr>
        `).join('');
    } else {
        endpointsTable.innerHTML = '<tr><td colspan="3" class="loading">暂无数据</td></tr>';
    }
}

function renderLogs(data) {
    const logsTable = document.getElementById('logsTable');
    
    if (!data.calls || data.calls.length === 0) {
        logsTable.innerHTML = '<tr><td colspan="6" class="loading">暂无调用记录</td></tr>';
        return;
    }
    
    logsTable.innerHTML = data.calls.map(call => `
        <tr>
            <td class="timestamp">${call.time}</td>
            <td><span class="method ${call.method.toLowerCase()}">${call.method}</span></td>
            <td><span class="endpoint" title="${call.path || call.endpoint}">${call.endpoint}</span></td>
            <td class="user-agent" title="${call.client}">${truncateText(call.client, 20)}</td>
            <td class="response-time">${call.responseTime}</td>
            <td><span class="status status-${getStatusClass(call.status)}">${call.status}</span></td>
        </tr>
    `).join('');
}

function renderDirectories(data) {
    const directoriesTable = document.getElementById('directoriesTable');
    
    if (!data.directories || data.directories.length === 0) {
        directoriesTable.innerHTML = '<tr><td colspan="4" class="loading">暂无目录访问记录</td></tr>';
        return;
    }
    
    // 按访问次数排序
    const sortedDirectories = data.directories.sort((a, b) => b.access_count - a.access_count);
    
    directoriesTable.innerHTML = sortedDirectories.map(dir => `
        <tr>
            <td><span class="directory-name">${escapeHtml(dir.directory_name)}</span></td>
            <td><span class="directory-type ${dir.directory_type}">${getDirectoryTypeLabel(dir.directory_type)}</span></td>
            <td class="access-count">${dir.access_count}</td>
            <td class="timestamp">${dir.last_accessed || '未知'}</td>
        </tr>
    `).join('');
}

// 辅助函数：格式化显示时间（已经是北京时间，直接显示时分秒）
function formatDisplayTime(timeString) {
    if (!timeString) return '未知';
    
    try {
        // 如果已经是格式化的时间字符串，直接提取时分秒
        if (timeString.includes('/') && timeString.includes(':')) {
            const timePart = timeString.split(' ')[1];
            return timePart || timeString;
        }
        
        // 如果是ISO格式，转换为北京时间
        const date = new Date(timeString);
        const beijingTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
        return beijingTime.toLocaleTimeString('zh-CN', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (error) {
        console.warn('时间格式化失败:', error);
        return timeString;
    }
}

// 辅助函数：获取状态码样式类
function getStatusClass(status) {
    const statusCode = parseInt(status);
    if (statusCode >= 200 && statusCode < 300) return 'success';
    if (statusCode >= 300 && statusCode < 400) return 'redirect';
    if (statusCode >= 400 && statusCode < 500) return 'client-error';
    if (statusCode >= 500) return 'server-error';
    return 'unknown';
}

// 辅助函数：获取目录类型标签
function getDirectoryTypeLabel(type) {
    const typeMap = {
        'picture': '图片',
        'video': '视频',
        'image': '图片',
        'media': '媒体'
    };
    return typeMap[type] || type;
}

// 辅助函数：截断文本
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// 辅助函数：转义HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 添加错误处理
function handleError(error, elementId, message) {
    console.error(message, error);
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `<div class="error">❌ ${message}</div>`;
    }
}

// 改进的加载函数，包含错误处理
async function loadDataWithErrorHandling() {
    const loadingElements = [
        { id: 'statsGrid', content: '<div class="loading">正在加载统计数据...</div>' },
        { id: 'endpointsTable', content: '<tr><td colspan="3" class="loading">正在加载...</td></tr>' },
        { id: 'directoriesTable', content: '<tr><td colspan="4" class="loading">正在加载...</td></tr>' },
        { id: 'logsTable', content: '<tr><td colspan="6" class="loading">正在加载...</td></tr>' }
    ];
    
    // 显示加载状态
    loadingElements.forEach(elem => {
        document.getElementById(elem.id).innerHTML = elem.content;
    });
    
    try {
        // 并行加载所有数据
        const [statsResponse, dirResponse, logsResponse] = await Promise.all([
            fetch('/api/stats'),
            fetch('/api/directories/stats'),
            fetch('/api/logs?limit=50')
        ]);
        
        // 检查响应状态
        if (!statsResponse.ok) throw new Error(`统计数据加载失败: ${statsResponse.status}`);
        if (!dirResponse.ok) throw new Error(`目录数据加载失败: ${dirResponse.status}`);
        if (!logsResponse.ok) throw new Error(`日志数据加载失败: ${logsResponse.status}`);
        
        // 解析数据
        const [statsData, dirData, logsData] = await Promise.all([
            statsResponse.json(),
            dirResponse.json(),
            logsResponse.json()
        ]);
        
        // 渲染数据
        renderStats(statsData);
        renderDirectories(dirData);
        renderLogs(logsData);
        
        console.log('✅ 数据加载完成');
        
    } catch (error) {
        console.error('❌ 加载数据失败:', error);
        
        // 为每个部分显示错误信息
        handleError(error, 'statsGrid', '统计数据加载失败');
        document.getElementById('endpointsTable').innerHTML = 
            '<tr><td colspan="3" class="error">加载失败</td></tr>';
        document.getElementById('directoriesTable').innerHTML = 
            '<tr><td colspan="4" class="error">加载失败</td></tr>';
        document.getElementById('logsTable').innerHTML = 
            '<tr><td colspan="6" class="error">加载失败</td></tr>';
    }
}

// 使用改进的加载函数
function loadData() {
    loadDataWithErrorHandling();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('📊 API调用记录页面初始化');
    loadData();
});

// 初始加载（保持兼容性）
loadData();

// 每30秒自动刷新
setInterval(loadData, 30000);

// 添加手动刷新快捷键
document.addEventListener('keydown', function(event) {
    if (event.ctrlKey && event.key === 'r') {
        event.preventDefault();
        console.log('🔄 手动刷新数据');
        loadData();
    }
});