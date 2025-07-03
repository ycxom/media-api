import database from './database.js';

class ApiLogger {
    constructor() {
        this.isReady = false;
        this.init();
    }

    async init() {
        try {
            await database.ensureInitialized();
            this.isReady = true;
            console.log('✅ API记录器初始化完成');
        } catch (error) {
            console.error('❌ API记录器初始化失败:', error);
            this.isReady = false;
        }
    }

    formatTimeToBeijing(timestamp) {
        const date = new Date(timestamp);
        const beijingTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
        return beijingTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }

    async logApiCall(req, res, responseTime) {
        if (!this.isReady) {
            try { await this.init(); } catch (error) { return; }
        }
        try {
            const endpoint = this.normalizeEndpoint(req.path);
            const userAgent = req.get('User-Agent') || 'Unknown';
            const callData = { endpoint, method: req.method, path: req.path, query: req.query || {}, userAgent: this.simplifyUserAgent(userAgent), responseTime: responseTime || 0, statusCode: res.statusCode, timestamp: new Date().toISOString() };
            await database.logApiCall(callData);
            await database.updateEndpointStats(endpoint, responseTime || 0);
            await database.updateSystemStats();
            await this.logDirectoryAccess(req.path);
        } catch (error) {
            console.error('❌ 记录API调用失败:', error.message);
        }
    }

    resolveAlias(name, type) {
        const config = this.getConfig();
        if (!config) return name;
        let aliasMap;
        if (type === 'pictureDir') aliasMap = config.pictureDirAliases;
        else if (type === 'videoDir') aliasMap = config.videoDirAliases;
        else if (type === 'pictureCategory') aliasMap = config.pictureCategoryAliases;
        else if (type === 'videoCategory') aliasMap = config.videoCategoryAliases;
        return aliasMap?.[name.trim()] || name.trim();
    }

    async logDirectoryAccess(path) {
        try {
            const parts = path.split('/').filter(Boolean);
            if (parts[0] !== 'api' || parts[1] !== 'v1') return;

            const group = parts[2];
            const type = parts[3];
            const method = parts[4];
            const value = parts[5];

            if (group === 'media' && value) {
                const mediaType = type === 'picture' ? 'picture' : 'video';
                if (method === 'by-dir') {
                    const directories = decodeURIComponent(value).split(',');
                    for (const dir of directories) {
                        const resolvedDir = this.resolveAlias(dir.trim(), `${mediaType}Dir`);
                        if (resolvedDir) await database.logDirectoryAccess(resolvedDir, mediaType);
                    }
                } else if (method === 'by-category') {
                    const resolvedCategory = this.resolveAlias(decodeURIComponent(value), `${mediaType}Category`);
                    await this.logCategoryAccess(resolvedCategory, mediaType);
                }
            } else if (group === 'media' && method === 'random') {
                const mediaType = type === 'picture' ? 'picture' : 'video';
                await this.logAllDirectoriesAccess(mediaType);
            } else if (group === 'wallpaper') {
                await database.logDirectoryAccess('wallpaper', 'picture');
            }
        } catch (error) {
            console.error('❌ 记录目录访问失败:', error.message);
        }
    }

    async logCategoryAccess(category, type) {
        try {
            const config = this.getConfig();
            if (!config) return;
            const catConfig = type === 'picture' ? config.pictureCategories : config.videoCategories;
            const categoryDirs = catConfig?.[category] || [];
            await database.logDirectoryAccess(`[分类]${category}`, type);
            for (const dir of categoryDirs) {
                if (dir.trim()) await database.logDirectoryAccess(dir.trim(), type);
            }
        } catch (error) {
            console.error('❌ 记录分类访问失败:', error.message);
        }
    }

    async logAllDirectoriesAccess(type) {
        await database.logDirectoryAccess(`[全部${type}]`, type);
    }

    getConfig() {
        return global.appConfig || null;
    }

    normalizeEndpoint(path) {
        const parts = path.split('/').filter(Boolean);
        if (parts.length > 5 && parts[0] === 'api' && parts[1] === 'v1') {
            if (parts[2] === 'media' && parts[4] === 'by-dir') return `/api/v1/media/${parts[3]}/by-dir/:dirs`;
            if (parts[2] === 'media' && parts[4] === 'by-category') return `/api/v1/media/${parts[3]}/by-category/:category`;
        }
        if (parts.length > 4 && parts[0] === 'api' && parts[1] === 'v1') {
            if (parts[2] === 'wallpaper' && parts[3] === 'by-ratio') return '/api/v1/wallpaper/by-ratio/:ratio';
            if (parts[2] === 'info' && parts[3] === 'category') return '/api/v1/info/category/:type/:category';
        }
        return path;
    }

    simplifyUserAgent(userAgent) {
        if (!userAgent || userAgent === 'Unknown') return userAgent;
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        if (userAgent.includes('curl')) return 'curl';
        if (userAgent.includes('wget')) return 'wget';
        if (userAgent.includes('Postman')) return 'Postman';
        return userAgent.length > 200 ? userAgent.substring(0, 200) + '...' : userAgent;
    }

    async getStats() {
        if (!this.isReady) await this.init();
        const systemStats = await database.getSystemStats();
        const endpointStats = await database.getEndpointStats(10);
        const startTime = new Date(systemStats.start_time);
        const now = new Date();
        const runTimeHours = Math.floor((now - startTime) / 3600000);
        return {
            overview: {
                totalCalls: systemStats.total_calls || 0,
                runTimeHours: runTimeHours,
                callsPerHour: runTimeHours > 0 ? Math.round((systemStats.total_calls || 0) / runTimeHours) : (systemStats.total_calls || 0),
                lastUpdate: this.formatTimeToBeijing(systemStats.last_update)
            },
            topEndpoints: (endpointStats || []).map(stat => ({
                endpoint: stat.endpoint,
                calls: stat.total_calls,
                avgResponseTime: stat.avg_response_time + 'ms'
            }))
        };
    }

    async getRecentCalls(limit = 50) {
        if (!this.isReady) await this.init();
        const calls = await database.getRecentCalls(limit);
        return (calls || []).map(call => ({
            time: this.formatTimeToBeijing(call.timestamp),
            endpoint: call.endpoint,
            method: call.method,
            client: call.user_agent,
            responseTime: call.response_time + 'ms',
            status: call.status_code,
            path: call.path
        }));
    }

    async getDirectoryStats() {
        if (!this.isReady) await this.init();
        const stats = await database.getDirectoryStats();
        return (stats || []).map(stat => ({
            ...stat,
            last_accessed: stat.last_accessed ? this.formatTimeToBeijing(stat.last_accessed) : null
        }));
    }
}

export default ApiLogger;
