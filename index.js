import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import chokidar from 'chokidar';
import ImageAnalyzer from './utils/imageAnalyzer.js';
import ApiLogger from './utils/apiLogger.js';
import database from './utils/database.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export const app = express();
export const PORT = 3001;

// 全局变量
export let imageAnalyzer = null;
export let apiLogger = null;
export let config = {};

// User-Agent解析
export function detectRatioFromUserAgent(userAgent, acceptHeader) {
    const ua = userAgent.toLowerCase();
    // 移动设备检测
    const isMobile = /mobile|android|iphone|ipad|phone|tablet/.test(ua);
    if (isMobile) {
        // 移动设备通常是竖屏
        if (/ipad/.test(ua)) return 'standard'; // iPad接近4:3
        return 'portrait'; // 手机通常是竖屏
    }
    // 桌面设备默认比例
    const isUltrawide = /ultrawide|3440x1440|2560x1080/.test(ua);
    if (isUltrawide) return 'ultrawide';
    // 默认宽屏
    return 'widescreen';
}

// 比例检测和匹配函数
export function detectRatioCategory(screenWidth, screenHeight) {
    if (!screenWidth || !screenHeight || screenWidth <= 0 || screenHeight <= 0) {
        console.warn('⚠️  无效分辨率，使用默认宽屏');
        return 'widescreen';
    }
    const aspectRatio = screenWidth / screenHeight;
    // console.log(`🖥️  ${screenWidth}x${screenHeight} 比例: ${aspectRatio.toFixed(2)}`);
    if (aspectRatio >= 2.3) return 'ultrawide';
    if (aspectRatio >= 1.7) return 'widescreen';
    if (aspectRatio >= 1.2) return 'standard';
    if (aspectRatio >= 0.5) return 'portrait';
    return 'square';
}

// 中间件
app.use(cors());
app.use(express.static('public'));
app.use(express.json()); // 添加JSON解析中间件

// 初始化API记录器
apiLogger = new ApiLogger();

// API记录中间件 - 必须在所有路由之前
app.use((req, res, next) => {
    const startTime = Date.now();

    // 监听响应结束
    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        // 只记录非静态资源的API调用
        if (!req.path.includes('.') && req.path !== '/') {
            // 异步记录，不阻塞响应
            apiLogger.logApiCall(req, res, responseTime).catch(error => {
                console.warn('⚠️  记录API调用失败:', error.message);
            });
        }
    });

    next();
});

// 文件扩展名
const imgExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const videoExt = ['.mp4', '.avi', '.wmv', '.mov', '.webm'];

// 递归子目录所有文件
export function getAllFiles(dirPath, exts, fileArray = []) {
    if (!fs.existsSync(dirPath)) return fileArray;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    entries.forEach(entry => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            getAllFiles(fullPath, exts, fileArray);
        } else if (entry.isFile() && exts.includes(path.extname(entry.name).toLowerCase())) {
            fileArray.push(fullPath);
        }
    });
    return fileArray;
}

// 随机文件选择
export function randomFileFromDirs(dirs, exts) {
    let allFiles = dirs.reduce((acc, dir) => acc.concat(getAllFiles(dir, exts)), []);
    return allFiles.length ? allFiles[Math.floor(Math.random() * allFiles.length)] : null;
}

// 初始化图片分析器
export const initImageAnalyzer = async () => {
    if (config.pictureDirs && config.pictureDirs.wallpaper) {
        const wallpaperPath = config.pictureDirs.wallpaper;
        // 销毁旧的分析器
        if (imageAnalyzer) {
            await imageAnalyzer.destroy();
        }
        // 创建新的分析器
        imageAnalyzer = new ImageAnalyzer(wallpaperPath);
        console.log('🔍 图片分析器已初始化');
    } else {
        console.warn('⚠️  wallpaper目录未配置，图片分析器未初始化');
    }
};

// 加载YAML配置
export const loadConfig = async () => {
    try {
        const fileContents = fs.readFileSync(path.join(__dirname, 'config.yaml'), 'utf8');
        config = yaml.load(fileContents);

        // 确保基础路径是数组格式
        const baseImgPaths = Array.isArray(config.baseImgPaths) ? config.baseImgPaths : [config.baseImgPaths];
        const baseVideoPaths = Array.isArray(config.baseVideoPaths) ? config.baseVideoPaths : [config.baseVideoPaths];

        // 通用多路径目录查找函数
        const resolveDirFromBases = (dirName, basePaths) => {
            for (let basePath of basePaths) {
                let fullPath = path.join(basePath, dirName);
                if (fs.existsSync(fullPath)) return fullPath;
            }
            return null;
        };

        // 图片目录解析 (支持多个路径)
        for (let key in config.pictureDirs) {
            const dirName = config.pictureDirs[key];
            const resolvedPath = resolveDirFromBases(dirName, baseImgPaths);
            if (resolvedPath) {
                config.pictureDirs[key] = resolvedPath;
            } else {
                console.error(`❌ 图片目录不存在: ${dirName}`);
                delete config.pictureDirs[key];
            }
        }

        // 视频目录解析 (支持多个路径)
        for (let key in config.videoDirs) {
            const dirName = config.videoDirs[key];
            const resolvedPath = resolveDirFromBases(dirName, baseVideoPaths);
            if (resolvedPath) {
                config.videoDirs[key] = resolvedPath;
            } else {
                console.error(`❌ 视频目录不存在: ${dirName}`);
                delete config.videoDirs[key];
            }
        }

        console.log('✔️ 完成加载配置文件，多路径检索成功！');
        // 将配置保存到全局，供ApiLogger使用
        global.appConfig = config;
        // 在配置加载完成后初始化图片分析器
        await initImageAnalyzer();
    } catch (e) {
        console.error('❌ 加载配置文件时错误:', e);
    }
};

// 初始化加载一次配置 - 修改为async
(async () => {
    await loadConfig();
})();

// 热重载配置 - 修改为async
chokidar.watch(path.join(__dirname, 'config.yaml')).on('change', async () => {
    console.log('🔄️ 配置文件变更，重新加载中...');
    await loadConfig();
});

// API: 提供目录列表和分类信息
app.get('/api/list', (req, res) => {
    const response = {
        pictureDirs: Object.keys(config.pictureDirs || {}),
        videoDirs: Object.keys(config.videoDirs || {}),
        pictureCategories: config.pictureCategories || {},
        videoCategories: config.videoCategories || {}
    };
    res.json(response);
});

// API: 提供完整的API文档数据
app.get('/api/docs', (req, res) => {
    const apiDocs = {
        serverInfo: {
            name: "随机媒体API服务",
            version: "1.0.0",
            description: "提供随机图片和视频资源的API服务",
            supportedFormats: {
                images: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
                videos: ['.mp4', '.avi', '.wmv', '.mov', '.webm']
            }
        },
        endpoints: [
            {
                category: "基础随机API",
                apis: [
                    {
                        method: "GET",
                        path: "/picture",
                        description: "获取随机图片（所有目录）",
                        example: "/picture",
                        response: "返回随机图片文件"
                    },
                    {
                        method: "GET",
                        path: "/video",
                        description: "获取随机视频（所有目录）",
                        example: "/video",
                        response: "返回随机视频文件"
                    },
                    {
                        method: "GET",
                        path: "/wallpaper",
                        description: "智能壁纸API - 根据屏幕分辨率自动匹配最相似比例的壁纸",
                        parameters: {
                            "w": "屏幕宽度（可选）",
                            "h": "屏幕高度（可选）"
                        },
                        examples: [
                            {
                                url: "/wallpaper",
                                description: "获取默认比例壁纸(16:9)"
                            },
                            {
                                url: "/wallpaper?w=3440&h=1440",
                                description: "21:9超宽屏壁纸"
                            },
                            {
                                url: "/wallpaper?w=1080&h=1920",
                                description: "竖屏壁纸"
                            }
                        ],
                        response: "返回最匹配比例的壁纸，响应头包含匹配信息"
                    },
                    {
                        method: "GET",
                        path: "/wallpaper/{比例类型}",
                        description: "获取指定比例类型的壁纸",
                        parameters: {
                            "比例类型": "ultrawide, widescreen, standard, portrait, square"
                        },
                        examples: [
                            {
                                url: "/wallpaper/ultrawide",
                                description: "获取21:9超宽屏壁纸"
                            },
                            {
                                url: "/wallpaper/portrait",
                                description: "获取竖屏壁纸"
                            }
                        ]
                    }
                ]
            },
            {
                category: "指定目录API",
                apis: [
                    {
                        method: "GET",
                        path: "/picture/{目录名}",
                        description: "获取指定目录的随机图片",
                        parameters: {
                            "目录名": "可用的图片目录名，支持多个目录用逗号分隔"
                        },
                        examples: Object.keys(config.pictureDirs || {}).slice(0, 3).map(dir => ({
                            url: `/picture/${encodeURIComponent(dir)}`,
                            description: `获取 ${dir} 目录的随机图片`
                        })),
                        availableDirectories: Object.keys(config.pictureDirs || {})
                    },
                    {
                        method: "GET",
                        path: "/video/{目录名}",
                        description: "获取指定目录的随机视频",
                        parameters: {
                            "目录名": "可用的视频目录名，支持多个目录用逗号分隔"
                        },
                        examples: Object.keys(config.videoDirs || {}).slice(0, 3).map(dir => ({
                            url: `/video/${encodeURIComponent(dir)}`,
                            description: `获取 ${dir} 目录的随机视频`
                        })),
                        availableDirectories: Object.keys(config.videoDirs || {})
                    }
                ]
            },
            {
                category: "分类随机API",
                apis: [
                    {
                        method: "GET",
                        path: "/api/random/picture/{分类名}",
                        description: "根据分类获取随机图片",
                        parameters: {
                            "分类名": "图片分类名称"
                        },
                        examples: Object.keys(config.pictureCategories || {}).slice(0, 3).map(category => ({
                            url: `/api/random/picture/${encodeURIComponent(category)}`,
                            description: `获取 ${category} 分类的随机图片`
                        })),
                        availableCategories: config.pictureCategories || {}
                    },
                    {
                        method: "GET",
                        path: "/api/random/video/{分类名}",
                        description: "根据分类获取随机视频",
                        parameters: {
                            "分类名": "视频分类名称"
                        },
                        examples: Object.keys(config.videoCategories || {}).slice(0, 3).map(category => ({
                            url: `/api/random/video/${encodeURIComponent(category)}`,
                            description: `获取 ${category} 分类的随机视频`
                        })),
                        availableCategories: config.videoCategories || {}
                    }
                ]
            },
            {
                category: "信息查询API",
                apis: [
                    {
                        method: "GET",
                        path: "/api/list",
                        description: "获取所有可用目录和分类信息",
                        example: "/api/list",
                        response: {
                            pictureDirs: "图片目录列表",
                            videoDirs: "视频目录列表",
                            pictureCategories: "图片分类信息",
                            videoCategories: "视频分类信息"
                        }
                    },
                    {
                        method: "GET",
                        path: "/api/stats",
                        description: "获取API调用统计信息",
                        example: "/api/stats",
                        response: "返回API调用统计和热门端点"
                    },
                    {
                        method: "GET",
                        path: "/api/logs",
                        description: "获取最近的API调用记录",
                        example: "/api/logs?limit=50",
                        response: "返回最近的API调用记录"
                    },
                    {
                        method: "GET",
                        path: "/api/directories/stats",
                        description: "获取目录访问统计",
                        example: "/api/directories/stats",
                        response: "返回各目录的访问统计"
                    },
                    {
                        method: "GET",
                        path: "/api/database/status",
                        description: "获取数据库状态信息",
                        example: "/api/database/status",
                        response: "返回数据库连接状态和基本统计"
                    }
                ]
            }
        ],
        usage: {
            cors: "支持跨域请求",
            cache: "建议在URL后添加随机参数避免缓存：?t=" + Date.now()
        },
        statistics: {
            totalPictureDirectories: Object.keys(config.pictureDirs || {}).length,
            totalVideoDirectories: Object.keys(config.videoDirs || {}).length,
            totalPictureCategories: Object.keys(config.pictureCategories || {}).length,
            totalVideoCategories: Object.keys(config.videoCategories || {}).length
        }
    };
    res.json(apiDocs);
});

// API: 根据分类获取目录列表
app.get('/api/category/:type/:category', (req, res) => {
    const { type, category } = req.params;
    if (type === 'picture') {
        const categoryDirs = config.pictureCategories?.[category] || [];
        const validDirs = categoryDirs.filter(dir => config.pictureDirs && config.pictureDirs[dir]);
        res.json({ dirs: validDirs, category });
    } else if (type === 'video') {
        const categoryDirs = config.videoCategories?.[category] || [];
        const validDirs = categoryDirs.filter(dir => config.videoDirs && config.videoDirs[dir]);
        res.json({ dirs: validDirs, category });
    } else {
        res.status(400).json({ error: '无效的类型' });
    }
});

// API: 根据分类随机获取文件
app.get('/api/random/:type/:category', (req, res) => {
    const { type, category } = req.params;
    if (type === 'picture') {
        const categoryDirs = config.pictureCategories?.[category] || [];
        const validDirs = categoryDirs
            .filter(dir => config.pictureDirs && config.pictureDirs[dir])
            .map(dir => config.pictureDirs[dir]);
        if (validDirs.length === 0) {
            return res.status(404).send('该分类下没有可用目录');
        }
        const file = randomFileFromDirs(validDirs, imgExt);
        file ? res.sendFile(file) : res.status(404).send('未找到图片');
    } else if (type === 'video') {
        const categoryDirs = config.videoCategories?.[category] || [];
        const validDirs = categoryDirs
            .filter(dir => config.videoDirs && config.videoDirs[dir])
            .map(dir => config.videoDirs[dir]);
        if (validDirs.length === 0) {
            return res.status(404).send('该分类下没有可用目录');
        }
        const file = randomFileFromDirs(validDirs, videoExt);
        file ? res.sendFile(file) : res.status(404).send('未找到视频');
    } else {
        res.status(400).send('无效的类型');
    }
});

// 随机图片API
app.get('/picture', (req, res) => {
    const file = randomFileFromDirs(Object.values(config.pictureDirs || {}), imgExt);
    file ? res.sendFile(file) : res.status(404).send('未找到图片');
});

// 随机视频API
app.get('/video', (req, res) => {
    const file = randomFileFromDirs(Object.values(config.videoDirs || {}), videoExt);
    file ? res.sendFile(file) : res.status(404).send('未找到视频');
});

// 指定目录图片API
app.get('/picture/:dirs', (req, res) => {
    const dirs = req.params.dirs.split(',')
        .map(key => config.pictureDirs && config.pictureDirs[key])
        .filter(Boolean);
    const file = randomFileFromDirs(dirs, imgExt);
    file ? res.sendFile(file) : res.status(404).send('未找到指定目录图片');
});

// 指定目录视频API
app.get('/video/:dirs', (req, res) => {
    const dirs = req.params.dirs.split(',')
        .map(key => config.videoDirs && config.videoDirs[key])
        .filter(Boolean);
    const file = randomFileFromDirs(dirs, videoExt);
    file ? res.sendFile(file) : res.status(404).send('未找到指定目录视频');
});

// 智能壁纸API - 使用分析器
app.get('/wallpaper', (req, res) => {
    // 如果有明确的w和h参数，优先使用
    if (req.query.w && req.query.h) {
        return handleWallpaperAPI(req, res);
    }
    // 从URL参数获取比例类型
    if (req.query.ratio) {
        const allowedRatios = ['ultrawide', 'widescreen', 'standard', 'portrait', 'square'];
        if (allowedRatios.includes(req.query.ratio)) {
            return handleWallpaperByRatio(req, res, req.query.ratio);
        }
    }
    // 通过User-Agent推测
    const userAgent = req.get('User-Agent') || '';
    const acceptHeader = req.get('Accept') || '';
    const detectedRatio = detectRatioFromUserAgent(userAgent, acceptHeader);
    return handleWallpaperByRatio(req, res, detectedRatio);
});

// 修复 handleWallpaperByRatio 函数
export async function handleWallpaperByRatio(req, res, targetRatio) {
    if (!imageAnalyzer) {
        return res.status(503).send('图片分析器未初始化');
    }

    try {
        const matchedImages = await imageAnalyzer.getImagesByRatio(targetRatio);

        if (matchedImages.length === 0) {
            // 如果没找到对应比例，fallback到widescreen
            const fallbackImages = await imageAnalyzer.getImagesByRatio('widescreen');
            if (fallbackImages.length === 0) {
                return res.status(404).send('未找到任何壁纸');
            }
            const randomImage = fallbackImages[Math.floor(Math.random() * fallbackImages.length)];
            res.set({
                'X-Target-Ratio': targetRatio,
                'X-Actual-Ratio': 'widescreen',
                'X-Fallback': 'true',
                'X-Matched-Images': fallbackImages.length.toString()
            });
            return res.sendFile(randomImage);
        }

        const randomImage = matchedImages[Math.floor(Math.random() * matchedImages.length)];
        res.set({
            'X-Target-Ratio': targetRatio,
            'X-Matched-Images': matchedImages.length.toString(),
            'X-Detection-Method': 'user-agent'
        });
        res.sendFile(randomImage);
    } catch (error) {
        console.error('❌ 壁纸API处理失败:', error);
        res.status(500).send('服务器内部错误');
    }
}

// 修复 handleWallpaperAPI 函数
export async function handleWallpaperAPI(req, res) {
    if (!imageAnalyzer) {
        return res.status(503).send('图片分析器未初始化');
    }

    const screenWidth = parseInt(req.query.w);
    const screenHeight = parseInt(req.query.h);

    // 验证参数
    if (!screenWidth || !screenHeight || screenWidth <= 0 || screenHeight <= 0) {
        return res.status(400).send('无效的分辨率参数');
    }

    try {
        const targetRatio = detectRatioCategory(screenWidth, screenHeight);
        const matchedImages = await imageAnalyzer.getImagesByRatio(targetRatio);

        if (matchedImages.length === 0) {
            return res.status(404).send(`未找到${targetRatio}比例的壁纸`);
        }

        const randomImage = matchedImages[Math.floor(Math.random() * matchedImages.length)];

        // 设置响应头
        res.set({
            'X-Target-Ratio': targetRatio,
            'X-Screen-Resolution': `${screenWidth}x${screenHeight}`,
            'X-Matched-Images': matchedImages.length.toString(),
            'X-Cache-Source': 'image-analyzer',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });

        res.sendFile(randomImage);
    } catch (error) {
        console.error('❌ 壁纸API处理失败:', error);
        res.status(500).send('服务器内部错误');
    }
}

// 修复指定比例壁纸API
app.get('/wallpaper/:ratio', async (req, res) => {
    if (!imageAnalyzer) {
        return res.status(503).send('图片分析器未初始化');
    }

    const { ratio } = req.params;
    const allowedRatios = ['ultrawide', 'widescreen', 'standard', 'portrait', 'square'];

    if (!allowedRatios.includes(ratio)) {
        return res.status(400).send(`支持的比例类型: ${allowedRatios.join(', ')}`);
    }

    try {
        const matchedImages = await imageAnalyzer.getImagesByRatio(ratio);

        if (matchedImages.length === 0) {
            return res.status(404).send(`未找到${ratio}比例的壁纸`);
        }

        const randomImage = matchedImages[Math.floor(Math.random() * matchedImages.length)];

        res.set('X-Target-Ratio', ratio);
        res.set('X-Matched-Images', matchedImages.length.toString());
        res.set('X-Cache-Source', 'image-analyzer');

        res.sendFile(randomImage);
    } catch (error) {
        console.error('❌ 指定比例壁纸API处理失败:', error);
        res.status(500).send('服务器内部错误');
    }
});

// 壁纸信息API
app.get('/api/wallpaper/info', (req, res) => {
    const info = {
        baseDirectory: (config.pictureDirs && config.pictureDirs.wallpaper) || 'wallpaper目录未配置',
        structure: "统一目录结构 - 所有壁纸直接放置在wallpaper目录下",
        intelligentMatching: "后端自动分析图片比例并智能匹配",
        supportedRatios: {
            ultrawide: "21:9及以上超宽屏 (比例 ≥ 2.3)",
            widescreen: "16:9, 16:10宽屏 (比例 1.7-2.3)",
            standard: "4:3, 5:4标准屏 (比例 1.2-1.7)",
            portrait: "竖屏 (比例 0.5-1.2)",
            square: "正方形及其他 (比例 < 0.5)"
        },
        fileNameTips: [
            "建议在文件名中包含分辨率: image_1920x1080.jpg",
            "支持比例标识: wallpaper_16-9.jpg, ultrawide_wallpaper.png",
            "系统会自动识别文件名中的比例信息"
        ],
        usage: {
            automatic: "/wallpaper?w=1920&h=1080 - 自动匹配最相似比例",
            manual: "/wallpaper/widescreen - 指定比例类型",
            analysis: "/api/wallpaper/analysis - 查看图片分布分析"
        }
    };
    res.json(info);
});

// 壁纸分析API
app.get('/api/wallpaper/analysis', (req, res) => {
    if (!imageAnalyzer) {
        return res.status(503).json({ error: '图片分析器未初始化' });
    }
    const stats = imageAnalyzer.getStatistics();
    res.json(stats);
});

// API: 获取调用统计
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await apiLogger.getStats();
        res.json(stats);
    } catch (error) {
        console.error('获取统计数据失败:', error);
        res.status(500).json({
            error: '获取统计数据失败',
            overview: {
                totalCalls: 0,
                runTimeHours: 0,
                callsPerHour: 0,
                lastUpdate: new Date().toISOString()
            },
            topEndpoints: []
        });
    }
});

// API: 获取最近调用记录
app.get('/api/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const recentCalls = await apiLogger.getRecentCalls(Math.min(limit, 200));

        res.json({
            total: recentCalls.length,
            calls: recentCalls
        });
    } catch (error) {
        console.error('获取调用记录失败:', error);
        res.status(500).json({
            total: 0,
            calls: [],
            error: '获取调用记录失败'
        });
    }
});

// API: 系统状态总览
app.get('/api/status', async (req, res) => {
    try {
        const stats = await apiLogger.getStats();
        const recentCalls = await apiLogger.getRecentCalls(10);

        const response = {
            server: {
                status: 'running',
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: '1.0.0'
            },
            api: {
                totalCalls: stats?.overview?.totalCalls || 0,
                recentActivity: recentCalls.length
            },
            config: {
                pictureDirectories: Object.keys(config.pictureDirs || {}).length,
                videoDirectories: Object.keys(config.videoDirs || {}).length,
                imageAnalyzer: imageAnalyzer ? 'active' : 'inactive'
            }
        };
        res.json(response);
    } catch (error) {
        console.error('获取系统状态失败:', error);
        res.status(500).json({
            server: {
                status: 'running',
                uptime: process.uptime(),
                version: '1.0.0'
            },
            error: '获取系统状态失败'
        });
    }
});

// API: 获取目录访问统计
app.get('/api/directories/stats', async (req, res) => {
    try {
        const directoryStats = await apiLogger.getDirectoryStats();
        res.json({
            total: directoryStats.length,
            directories: directoryStats
        });
    } catch (error) {
        console.error('获取目录统计失败:', error);
        res.status(500).json({
            total: 0,
            directories: [],
            error: '获取目录统计失败'
        });
    }
});

// API: 获取数据库状态
app.get('/api/database/status', async (req, res) => {
    try {
        await database.ensureInitialized();

        const systemStats = await database.getSystemStats();

        res.json({
            database: {
                type: 'SQLite',
                path: database.dbPath,
                connected: database.isInitialized
            },
            records: {
                totalApiCalls: systemStats.total_calls || 0,
                startTime: systemStats.start_time
            },
            status: 'connected'
        });
    } catch (error) {
        console.error('获取数据库状态失败:', error);
        res.status(500).json({
            database: {
                type: 'SQLite',
                connected: false
            },
            error: '获取数据库状态失败',
            details: error.message
        });
    }
});

// 首页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API文档页面路由
app.get('/docs', (req, res) => {
    res.sendFile(path.join(__dirname, './public/docs.html'));
});

// 调用记录页面路由
app.get('/logs', (req, res) => {
    res.sendFile(path.join(__dirname, './public/logs.html'));
});

// 处理404
app.use((req, res) => res.status(404).send(`
    <h1>❌ 404 Not Found</h1>
    <p>可用页面：</p>
    <ul>
        <li><a href="/">首页</a></li>
        <li><a href="/docs">API文档</a></li>
        <li><a href="/logs">调用记录</a></li>
    </ul>
`));

// 启动服务器
app.listen(PORT, () => console.log(`🚀 服务已运行: http://localhost:${PORT}`));

// 优雅关闭 - 修复
process.on('SIGINT', async () => {
    console.log('\n🛑 正在关闭服务...');
    if (imageAnalyzer) {
        await imageAnalyzer.destroy();
    }
    try {
        await database.close();
    } catch (error) {
        console.error('关闭数据库失败:', error);
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 正在关闭服务...');
    if (imageAnalyzer) {
        await imageAnalyzer.destroy();
    }
    try {
        await database.close();
    } catch (error) {
        console.error('关闭数据库失败:', error);
    }
    process.exit(0);
});