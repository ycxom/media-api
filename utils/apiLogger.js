import database from './database.js';

class ApiLogger {
    constructor() {
        this.isReady = false;
        this.init();
    }

    async init() {
        try {
            // 等待数据库初始化完成
            await database.ensureInitialized();
            this.isReady = true;
            console.log('✅ API记录器初始化完成');
        } catch (error) {
            console.error('❌ API记录器初始化失败:', error);
            this.isReady = false;
        }
    }

    // 格式化时间为北京时间
    formatTimeToBeijing(timestamp) {
        const date = new Date(timestamp);
        // 转换为北京时间 (UTC+8)
        const beijingTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));

        return beijingTime.toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    async logApiCall(req, res, responseTime) {
        // 如果记录器未准备好，先尝试等待初始化
        if (!this.isReady) {
            try {
                await this.init();
            } catch (error) {
                console.warn('⚠️  API记录器不可用，跳过记录');
                return;
            }
        }

        try {
            const endpoint = this.normalizeEndpoint(req.path);
            const userAgent = req.get('User-Agent') || 'Unknown';

            const callData = {
                endpoint,
                method: req.method,
                path: req.path,
                query: req.query || {},
                userAgent: this.simplifyUserAgent(userAgent),
                responseTime: responseTime || 0,
                statusCode: res.statusCode,
                // 使用当前时间戳
                timestamp: new Date().toISOString()
            };

            // 记录API调用
            await database.logApiCall(callData);

            // 更新统计
            await database.updateEndpointStats(endpoint, responseTime || 0);
            await database.updateSystemStats();

            // 记录目录访问（包括所有相关的目录访问）
            await this.logDirectoryAccess(req.path, req.params, req.query);
        } catch (error) {
            console.error('❌ 记录API调用失败:', error.message);
        }
    }

    // 增强的目录访问记录方法
    async logDirectoryAccess(path, params, query) {
        try {
            // 1. 处理指定目录的API调用
            if (path.startsWith('/picture/')) {
                const pathParts = path.split('/');
                if (pathParts.length > 2) {
                    const directoryName = decodeURIComponent(pathParts[2]);
                    // 处理多个目录的情况（用逗号分隔）
                    const directories = directoryName.split(',');
                    for (const dir of directories) {
                        if (dir.trim()) {
                            await database.logDirectoryAccess(dir.trim(), 'picture');
                        }
                    }
                }
            } else if (path.startsWith('/video/')) {
                const pathParts = path.split('/');
                if (pathParts.length > 2) {
                    const directoryName = decodeURIComponent(pathParts[2]);
                    const directories = directoryName.split(',');
                    for (const dir of directories) {
                        if (dir.trim()) {
                            await database.logDirectoryAccess(dir.trim(), 'video');
                        }
                    }
                }
            }

            // 2. 处理分类API调用 - 记录分类下的所有目录
            else if (path.startsWith('/api/random/picture/')) {
                const category = decodeURIComponent(path.split('/')[4]);
                await this.logCategoryAccess(category, 'picture');
            } else if (path.startsWith('/api/random/video/')) {
                const category = decodeURIComponent(path.split('/')[4]);
                await this.logCategoryAccess(category, 'video');
            }

            // 3. 处理壁纸API调用
            else if (path.startsWith('/wallpaper')) {
                await database.logDirectoryAccess('wallpaper', 'picture');
            }

            // 4. 处理根路径调用 - 记录所有目录的访问
            else if (path === '/picture') {
                await this.logAllDirectoriesAccess('picture');
            } else if (path === '/video') {
                await this.logAllDirectoriesAccess('video');
            }
        } catch (error) {
            console.error('❌ 记录目录访问失败:', error.message);
        }
    }

    // 记录分类访问 - 将分类下的所有目录都记录一次访问
    async logCategoryAccess(category, type) {
        try {
            // 需要从主应用获取配置，这里我们通过require获取
            const config = this.getConfig();
            if (!config) return;

            let categoryDirs = [];
            if (type === 'picture' && config.pictureCategories) {
                categoryDirs = config.pictureCategories[category] || [];
            } else if (type === 'video' && config.videoCategories) {
                categoryDirs = config.videoCategories[category] || [];
            }

            // 记录分类本身
            await database.logDirectoryAccess(`[分类]${category}`, type);

            // 记录分类下的所有目录
            for (const dir of categoryDirs) {
                if (dir.trim()) {
                    await database.logDirectoryAccess(dir.trim(), type);
                }
            }
        } catch (error) {
            console.error('❌ 记录分类访问失败:', error.message);
        }
    }

    // 记录所有目录访问 - 当调用根路径时
    async logAllDirectoriesAccess(type) {
        try {
            const config = this.getConfig();
            if (!config) return;

            let allDirs = [];
            if (type === 'picture' && config.pictureDirs) {
                allDirs = Object.keys(config.pictureDirs);
            } else if (type === 'video' && config.videoDirs) {
                allDirs = Object.keys(config.videoDirs);
            }

            // 记录一个特殊的"全部"访问
            await database.logDirectoryAccess(`[全部${type}]`, type);

            // 可选：也可以给每个目录增加一次访问计数
            // for (const dir of allDirs) {
            //     await database.logDirectoryAccess(dir, type);
            // }
        } catch (error) {
            console.error('❌ 记录全部目录访问失败:', error.message);
        }
    }

    // 获取配置的辅助方法
    getConfig() {
        try {
            // 尝试从缓存或全局获取配置
            if (global.appConfig) {
                return global.appConfig;
            }
            // 如果没有全局配置，返回null
            return null;
        } catch (error) {
            console.warn('⚠️ 无法获取应用配置');
            return null;
        }
    }

    normalizeEndpoint(path) {
        if (path.startsWith('/picture/')) return '/picture/:dir';
        if (path.startsWith('/video/')) return '/video/:dir';
        if (path.startsWith('/wallpaper/')) return '/wallpaper/:ratio';
        if (path.startsWith('/api/random/')) return '/api/random/:type/:category';
        if (path.startsWith('/api/category/')) return '/api/category/:type/:category';
        return path;
    }

    simplifyUserAgent(userAgent) {
        // 如果 userAgent 为空或 'Unknown'，直接返回
        if (!userAgent || userAgent === 'Unknown') {
            return userAgent;
        }

        // 检查常见的浏览器和工具
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        if (userAgent.includes('curl')) return 'curl';
        if (userAgent.includes('wget')) return 'wget';
        if (userAgent.includes('Postman')) return 'Postman';
        if (userAgent.includes('axios')) return 'axios';
        if (userAgent.includes('node')) return 'Node.js';
        if (userAgent.includes('Python')) return 'Python';
        if (userAgent.includes('Java')) return 'Java';
        if (userAgent.includes('Go-http-client')) return 'Go';

        // 如果无法识别，返回完整的 User-Agent
        return userAgent.length > 200 ? userAgent.substring(0, 200) + '...' : userAgent;
    }

    async getStats() {
        try {
            if (!this.isReady) {
                await this.init();
            }
            const systemStats = await database.getSystemStats();
            const endpointStats = await database.getEndpointStats(10);

            // 计算运行时间
            const startTime = new Date(systemStats.start_time);
            const now = new Date();
            const runTimeHours = Math.floor((now - startTime) / 1000 / 60 / 60);

            return {
                overview: {
                    totalCalls: systemStats.total_calls || 0,
                    runTimeHours: runTimeHours,
                    callsPerHour: runTimeHours > 0 ? Math.round((systemStats.total_calls || 0) / runTimeHours) : 0,
                    lastUpdate: this.formatTimeToBeijing(systemStats.last_update)
                },
                topEndpoints: (endpointStats || []).map(stat => ({
                    endpoint: stat.endpoint,
                    calls: stat.total_calls,
                    avgResponseTime: stat.avg_response_time + 'ms'
                }))
            };
        } catch (error) {
            console.error('❌ 获取统计数据失败:', error);
            return {
                overview: {
                    totalCalls: 0,
                    runTimeHours: 0,
                    callsPerHour: 0,
                    lastUpdate: this.formatTimeToBeijing(new Date().toISOString())
                },
                topEndpoints: []
            };
        }
    }

    async getRecentCalls(limit = 50) {
        try {
            if (!this.isReady) {
                await this.init();
            }
            const calls = await database.getRecentCalls(limit);
            return (calls || []).map(call => ({
                time: this.formatTimeToBeijing(call.timestamp),
                endpoint: call.endpoint,
                method: call.method,
                client: call.user_agent,
                responseTime: call.response_time + 'ms',
                status: call.status_code,
                path: call.path // 添加完整路径信息
            }));
        } catch (error) {
            console.error('❌ 获取调用记录失败:', error);
            return [];
        }
    }

    async getDirectoryStats() {
        try {
            if (!this.isReady) {
                await this.init();
            }
            const stats = await database.getDirectoryStats();

            return (stats || []).map(stat => ({
                ...stat,
                last_accessed: stat.last_accessed ? this.formatTimeToBeijing(stat.last_accessed) : null
            }));
        } catch (error) {
            console.error('❌ 获取目录统计失败:', error);
            return [];
        }
    }

    async cleanup(daysToKeep = 30) {
        try {
            if (!this.isReady) {
                await this.init();
            }
            return await database.cleanup(daysToKeep);
        } catch (error) {
            console.error('❌ 清理记录失败:', error);
            return 0;
        }
    }
}

export default ApiLogger;