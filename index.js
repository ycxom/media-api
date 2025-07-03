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
export const PORT = 3000;

// 全局变量
export let imageAnalyzer = null;
export let apiLogger = null;
export let config = {};

// User-Agent解析
export function detectRatioFromUserAgent(userAgent, acceptHeader) {
    const ua = userAgent.toLowerCase();
    const isMobile = /mobile|android|iphone|ipad|phone|tablet/.test(ua);
    if (isMobile) {
        if (/ipad/.test(ua)) return 'standard';
        return 'portrait';
    }
    const isUltrawide = /ultrawide|3440x1440|2560x1080/.test(ua);
    if (isUltrawide) return 'ultrawide';
    return 'widescreen';
}

// 比例检测和匹配函数
export function detectRatioCategory(screenWidth, screenHeight) {
    if (!screenWidth || !screenHeight || screenWidth <= 0 || screenHeight <= 0) {
        console.warn('⚠️  无效分辨率，使用默认宽屏');
        return 'widescreen';
    }
    const aspectRatio = screenWidth / screenHeight;
    if (aspectRatio >= 2.3) return 'ultrawide';
    if (aspectRatio >= 1.7) return 'widescreen';
    if (aspectRatio >= 1.2) return 'standard';
    if (aspectRatio >= 0.5) return 'portrait';
    return 'square';
}

// 中间件
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// 初始化API记录器
apiLogger = new ApiLogger();

// API记录中间件 - 必须在所有路由之前
app.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        if (req.path.startsWith('/api/')) { // 只记录新的API路径
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
        if (imageAnalyzer) {
            await imageAnalyzer.destroy();
        }
        imageAnalyzer = new ImageAnalyzer(wallpaperPath);
        console.log('🔍 图片分析器已初始化');
    } else {
        console.warn('⚠️  wallpaper目录未配置，图片分析器未初始化');
    }
};

// 加载YAML配置 (已修复)
export const loadConfig = async () => {
    try {
        const fileContents = fs.readFileSync(path.join(__dirname, 'config.yaml'), 'utf8');
        const newConfig = yaml.load(fileContents);

        // **FIX**: 检查加载的配置是否有效，防止因文件暂时清空导致崩溃
        if (!newConfig || typeof newConfig !== 'object') {
            console.warn('⚠️  配置文件为空或格式无效，跳过本次重载。');
            return; // 保持旧配置并退出
        }

        config = newConfig; // 仅在配置有效时赋值

        // 安全地处理基础路径
        const baseImgPaths = Array.isArray(config.baseImgPaths) ? config.baseImgPaths : (config.baseImgPaths ? [config.baseImgPaths] : []);
        const baseVideoPaths = Array.isArray(config.baseVideoPaths) ? config.baseVideoPaths : (config.baseVideoPaths ? [config.baseVideoPaths] : []);

        const resolveDirFromBases = (dirName, basePaths) => {
            for (let basePath of basePaths) {
                let fullPath = path.join(basePath, dirName);
                if (fs.existsSync(fullPath)) return fullPath;
            }
            return null;
        };

        // 图片目录解析
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

        // 视频目录解析
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

        // 确保别名配置存在
        config.pictureDirAliases = config.pictureDirAliases || {};
        config.videoDirAliases = config.videoDirAliases || {};
        config.pictureCategoryAliases = config.pictureCategoryAliases || {};
        config.videoCategoryAliases = config.videoCategoryAliases || {};

        console.log('✔️ 完成加载配置文件，多路径检索成功！');
        global.appConfig = config;
        await initImageAnalyzer();
    } catch (e) {
        console.error('❌ 加载配置文件时错误:', e);
    }
};


// 通用别名解析函数
function resolveAlias(name, type) {
    let aliasMap;
    switch (type) {
        case 'pictureDir': aliasMap = config.pictureDirAliases; break;
        case 'videoDir': aliasMap = config.videoDirAliases; break;
        case 'pictureCategory': aliasMap = config.pictureCategoryAliases; break;
        case 'videoCategory': aliasMap = config.videoCategoryAliases; break;
        default: return name;
    }
    return aliasMap?.[name.trim()] || name.trim();
}

// 初始化
(async () => {
    await loadConfig();
})();

// 热重载配置
chokidar.watch(path.join(__dirname, 'config.yaml')).on('change', async () => {
    console.log('🔄️ 配置文件变更，重新加载中...');
    await loadConfig();
});


// =================================================================
// API Router (v1)
// =================================================================
const apiRouter = express.Router();

// --- Media Routes ---
apiRouter.get('/media/:type/random', (req, res) => {
    const { type } = req.params;
    const dirs = type === 'picture' ? config.pictureDirs : config.videoDirs;
    const exts = type === 'picture' ? imgExt : videoExt;
    const file = randomFileFromDirs(Object.values(dirs || {}), exts);
    file ? res.sendFile(file) : res.status(404).send(`未找到${type}`);
});

apiRouter.get('/media/:type/by-dir/:dirs', (req, res) => {
    try {
        const { type, dirs: encodedDirs } = req.params;
        const decodedDirs = decodeURIComponent(encodedDirs);
        const aliasType = `${type}Dir`;
        const dirConfig = type === 'picture' ? config.pictureDirs : config.videoDirs;
        const exts = type === 'picture' ? imgExt : videoExt;

        const dirs = decodedDirs.split(',')
            .map(dir => resolveAlias(dir.trim(), aliasType))
            .map(key => dirConfig?.[key])
            .filter(Boolean);

        if (dirs.length === 0) {
            return res.status(404).send('未找到指定目录或别名对应的媒体文件');
        }
        const file = randomFileFromDirs(dirs, exts);
        file ? res.sendFile(file) : res.status(404).send(`未找到${type}`);
    } catch (e) {
        res.status(400).send('错误的目录名格式');
    }
});

apiRouter.get('/media/:type/by-category/:category', (req, res) => {
    try {
        const { type, category: encodedCategory } = req.params;
        const category = decodeURIComponent(encodedCategory);
        const aliasType = `${type}Category`;
        const resolvedCategory = resolveAlias(category, aliasType);

        const catConfig = type === 'picture' ? config.pictureCategories : config.videoCategories;
        const dirConfig = type === 'picture' ? config.pictureDirs : config.videoDirs;
        const exts = type === 'picture' ? imgExt : videoExt;

        const categoryDirs = catConfig?.[resolvedCategory] || [];
        const validDirs = categoryDirs.map(dir => dirConfig?.[dir]).filter(Boolean);

        if (validDirs.length === 0) {
            return res.status(404).send('该分类下没有可用目录');
        }
        const file = randomFileFromDirs(validDirs, exts);
        file ? res.sendFile(file) : res.status(404).send(`未找到${type}`);
    } catch (e) {
        res.status(400).send('错误的分类名格式');
    }
});

// --- Wallpaper Routes ---
apiRouter.get('/wallpaper/smart', (req, res) => {
    if (req.query.w && req.query.h) {
        return handleWallpaperAPI(req, res);
    }
    const userAgent = req.get('User-Agent') || '';
    const acceptHeader = req.get('Accept') || '';
    const detectedRatio = detectRatioFromUserAgent(userAgent, acceptHeader);
    return handleWallpaperByRatio(req, res, detectedRatio);
});

apiRouter.get('/wallpaper/by-ratio/:ratio', (req, res) => {
    const { ratio } = req.params;
    const allowedRatios = ['ultrawide', 'widescreen', 'standard', 'portrait', 'square'];
    if (!allowedRatios.includes(ratio)) {
        return res.status(400).send(`支持的比例类型: ${allowedRatios.join(', ')}`);
    }
    handleWallpaperByRatio(req, res, ratio);
});

apiRouter.get('/wallpaper/info', (req, res) => {
    res.json({
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
    });
});

apiRouter.get('/wallpaper/analysis', (req, res) => {
    if (!imageAnalyzer) {
        return res.status(503).json({ error: '图片分析器未初始化' });
    }
    const stats = imageAnalyzer.getStatistics();
    res.json(stats);
});

// --- Info Routes ---
apiRouter.get('/info/lists', (req, res) => {
    res.json({
        pictureDirs: Object.keys(config.pictureDirs || {}),
        videoDirs: Object.keys(config.videoDirs || {}),
        pictureCategories: config.pictureCategories || {},
        videoCategories: config.videoCategories || {},
        pictureDirAliases: config.pictureDirAliases || {},
        videoDirAliases: config.videoDirAliases || {},
        pictureCategoryAliases: config.pictureCategoryAliases || {},
        videoCategoryAliases: config.videoCategoryAliases || {},
    });
});

apiRouter.get('/info/category/:type/:category', (req, res) => {
    const { type, category } = req.params;
    const catConfig = type === 'picture' ? config.pictureCategories : config.videoCategories;
    const dirConfig = type === 'picture' ? config.pictureDirs : config.videoDirs;
    const categoryDirs = catConfig?.[category] || [];
    const validDirs = categoryDirs.filter(dir => dirConfig && dirConfig[dir]);
    res.json({ dirs: validDirs, category });
});

apiRouter.get('/info/stats', async (req, res) => {
    try {
        const stats = await apiLogger.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: '获取统计数据失败' });
    }
});

apiRouter.get('/info/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const recentCalls = await apiLogger.getRecentCalls(Math.min(limit, 200));
        res.json({ total: recentCalls.length, calls: recentCalls });
    } catch (error) {
        res.status(500).json({ error: '获取调用记录失败' });
    }
});

apiRouter.get('/info/dir-stats', async (req, res) => {
    try {
        const directoryStats = await apiLogger.getDirectoryStats();
        res.json({ total: directoryStats.length, directories: directoryStats });
    } catch (error) {
        res.status(500).json({ error: '获取目录统计失败' });
    }
});

apiRouter.get('/info/status', async (req, res) => {
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
        res.status(500).json({ error: '获取数据库状态失败' });
    }
});

// --- Docs Route ---
apiRouter.get('/docs', (req, res) => {
    res.json({ message: "API文档将在这里生成，请更新前端以适配新路径。" });
});

// Mount the v1 router
app.use('/api/v1', apiRouter);

// =================================================================
// Wallpaper Helper Functions (kept separate for clarity)
// =================================================================
export async function handleWallpaperByRatio(req, res, targetRatio) {
    if (!imageAnalyzer) return res.status(503).send('图片分析器未初始化');
    try {
        const matchedImages = await imageAnalyzer.getImagesByRatio(targetRatio);
        if (matchedImages.length === 0) {
            const fallbackImages = await imageAnalyzer.getImagesByRatio('widescreen');
            if (fallbackImages.length === 0) return res.status(404).send('未找到任何壁纸');
            const randomImage = fallbackImages[Math.floor(Math.random() * fallbackImages.length)];
            res.set({ 'X-Fallback': 'true' });
            return res.sendFile(randomImage);
        }
        const randomImage = matchedImages[Math.floor(Math.random() * matchedImages.length)];
        res.sendFile(randomImage);
    } catch (error) {
        res.status(500).send('服务器内部错误');
    }
}

export async function handleWallpaperAPI(req, res) {
    if (!imageAnalyzer) return res.status(503).send('图片分析器未初始化');
    const screenWidth = parseInt(req.query.w);
    const screenHeight = parseInt(req.query.h);
    if (!screenWidth || !screenHeight) return res.status(400).send('无效的分辨率参数');
    const targetRatio = detectRatioCategory(screenWidth, screenHeight);
    handleWallpaperByRatio(req, res, targetRatio);
}

// =================================================================
// Redirects for Legacy Routes
// =================================================================
app.get('/picture', (req, res) => res.redirect(301, '/api/v1/media/picture/random'));
app.get('/video', (req, res) => res.redirect(301, '/api/v1/media/video/random'));
app.get('/picture/:dirs', (req, res) => res.redirect(301, `/api/v1/media/picture/by-dir/${req.params.dirs}`));
app.get('/video/:dirs', (req, res) => res.redirect(301, `/api/v1/media/video/by-dir/${req.params.dirs}`));
app.get('/api/random/:type/:category', (req, res) => res.redirect(301, `/api/v1/media/${req.params.type}/by-category/${req.params.category}`));
app.get('/wallpaper', (req, res) => {
    const queryString = new URLSearchParams(req.query).toString();
    res.redirect(301, `/api/v1/wallpaper/smart${queryString ? '?' + queryString : ''}`);
});
app.get('/wallpaper/:ratio', (req, res) => res.redirect(301, `/api/v1/wallpaper/by-ratio/${req.params.ratio}`));
app.get('/api/list', (req, res) => res.redirect(301, '/api/v1/info/lists'));
app.get('/api/docs', (req, res) => res.redirect(301, '/api/v1/docs'));
app.get('/api/stats', (req, res) => res.redirect(301, '/api/v1/info/stats'));
app.get('/api/logs', (req, res) => res.redirect(301, `/api/v1/info/logs?${new URLSearchParams(req.query).toString()}`));
app.get('/api/directories/stats', (req, res) => res.redirect(301, '/api/v1/info/dir-stats'));
app.get('/api/database/status', (req, res) => res.redirect(301, '/api/v1/info/status'));
app.get('/api/category/:type/:category', (req, res) => res.redirect(301, `/api/v1/info/category/${req.params.type}/${req.params.category}`));
app.get('/api/wallpaper/info', (req, res) => res.redirect(301, '/api/v1/wallpaper/info'));
app.get('/api/wallpaper/analysis', (req, res) => res.redirect(301, '/api/v1/wallpaper/analysis'));


// =================================================================
// Frontend Routes & 404
// =================================================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/docs', (req, res) => res.sendFile(path.join(__dirname, 'public/docs.html')));
app.get('/logs', (req, res) => res.sendFile(path.join(__dirname, 'public/logs.html')));

app.use((req, res) => res.status(404).send(`<h1>❌ 404 Not Found</h1>`));

// 启动服务器
app.listen(PORT, () => console.log(`🚀 服务已运行: http://localhost:${PORT}`));

// 优雅关闭
process.on('SIGINT', async () => {
    console.log('\n🛑 正在关闭服务...');
    if (imageAnalyzer) await imageAnalyzer.destroy();
    try { await database.close(); } catch (error) { console.error('关闭数据库失败:', error); }
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('\n🛑 正在关闭服务...');
    if (imageAnalyzer) await imageAnalyzer.destroy();
    try { await database.close(); } catch (error) { console.error('关闭数据库失败:', error); }
    process.exit(0);
});
