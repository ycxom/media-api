function renderStatsLogs(data) {
    const statsGrid = document.getElementById('statsGrid');
    if (!statsGrid || !data || !data.overview) return;
    statsGrid.innerHTML = `
        <div class="stat-card"><div class="stat-value">${data.overview.totalCalls}</div><div class="stat-label">总调用次数</div></div>
        <div class="stat-card"><div class="stat-value">${data.overview.runTimeHours}h</div><div class="stat-label">运行时间</div></div>
        <div class="stat-card"><div class="stat-value">${data.overview.callsPerHour}</div><div class="stat-label">每小时调用</div></div>
        <div class="stat-card"><div class="stat-value">${formatDisplayTime(data.overview.lastUpdate)}</div><div class="stat-label">最后更新</div></div>
    `;
    const endpointsTable = document.getElementById('endpointsTable');
    if (endpointsTable && data.topEndpoints && data.topEndpoints.length > 0) {
        endpointsTable.innerHTML = data.topEndpoints.map(endpoint => `
            <tr>
                <td><span class="endpoint">${endpoint.endpoint}</span></td>
                <td>${endpoint.calls}</td>
                <td>${endpoint.avgResponseTime}</td>
            </tr>
        `).join('');
    } else if (endpointsTable) {
        endpointsTable.innerHTML = '<tr><td colspan="3" class="loading">暂无数据</td></tr>';
    }
}
// 渲染日志
function renderLogs(data) {
    const logsTable = document.getElementById('logsTable');
    if (!logsTable || !data || !data.calls || data.calls.length === 0) {
        if (logsTable) logsTable.innerHTML = '<tr><td colspan="6" class="loading">暂无调用记录</td></tr>';
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
// 渲染目录
function renderDirectories(data) {
    const directoriesTable = document.getElementById('directoriesTable');
    if (!directoriesTable || !data || !data.directories || data.directories.length === 0) {
        if (directoriesTable) directoriesTable.innerHTML = '<tr><td colspan="4" class="loading">暂无目录访问记录</td></tr>';
        return;
    }
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
// 辅助函数
function formatDisplayTime(timeString) {
    if (!timeString) return '未知';
    try {
        if (timeString.includes('/') && timeString.includes(':')) {
            return timeString.split(' ')[1] || timeString;
        }
        const date = new Date(timeString);
        return new Date(date.getTime() + (8 * 60 * 60 * 1000)).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (error) {
        return timeString;
    }
}
function getStatusClass(status) {
    const statusCode = parseInt(status);
    if (statusCode >= 200 && statusCode < 300) return 'success';
    if (statusCode >= 400) return 'client-error';
    return 'unknown';
}
function getDirectoryTypeLabel(type) { return { 'picture': '图片', 'video': '视频' }[type] || type; }
function truncateText(text, maxLength) { return text && text.length > maxLength ? text.substring(0, maxLength) + '...' : text; }
function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

// 加载数据（更新版）
async function loadLogsData() {
    try {
        const [statsResponse, dirResponse, logsResponse] = await Promise.all([
            fetch('/api/v1/info/stats'),
            fetch('/api/v1/info/dir-stats'),
            fetch('/api/v1/info/logs?limit=50')
        ]);
        const [statsData, dirData, logsData] = await Promise.all([
            statsResponse.json(), dirResponse.json(), logsResponse.json()
        ]);
        renderStatsLogs(statsData);
        renderDirectories(dirData);
        renderLogs(logsData);
    } catch (error) {
        console.error('加载数据失败:', error);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('logsTable')) { // Only run on logs page
        loadLogsData();
        setInterval(loadLogsData, 30000);
    }
});