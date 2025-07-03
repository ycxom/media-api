import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import chokidar from 'chokidar';
import database from './database.js';

class ImageAnalyzer {
    constructor(wallpaperPath) {
        this.wallpaperPath = wallpaperPath;
        this.imageCache = new Map();
        this.ratioMap = {
            ultrawide: { min: 2.3, max: Infinity },
            widescreen: { min: 1.7, max: 2.3 },
            standard: { min: 1.2, max: 1.7 },
            portrait: { min: 0.5, max: 1.2 },
            square: { min: 0, max: 0.5 }
        };
        this.watcher = null;
        this.isAnalyzing = false;
        this.queue = [];
        this.cacheChanged = false;
        this.isInitialized = false;

        this.init();
    }

    // 初始化
    async init() {
        try {
            // 等待数据库初始化
            await database.ensureInitialized();

            // 从数据库加载缓存
            await this.loadCacheFromDatabase();

            // 初始化文件监控
            this.initWatcher();

            // 初始化保存机制
            this.initSaveThrottle();

            this.isInitialized = true;
            console.log('✅ 图片分析器初始化完成');
        } catch (error) {
            console.error('❌ 图片分析器初始化失败:', error);
        }
    }

    // 从数据库加载缓存
    async loadCacheFromDatabase() {
        try {
            const imageData = await database.getAllImageCache();
            this.imageCache.clear();

            for (const image of imageData) {
                this.imageCache.set(image.file_path, {
                    path: image.file_path,
                    width: image.width,
                    height: image.height,
                    aspectRatio: image.aspect_ratio,
                    category: image.category,
                    format: image.format,
                    size: image.file_size,
                    mtime: image.file_mtime,
                    fromFileName: image.from_filename === 1,
                    source: image.source
                });
            }

            console.log(`✅ 从数据库加载图片缓存: ${this.imageCache.size} 张图片`);
        } catch (error) {
            console.error('❌ 从数据库加载缓存失败:', error.message);
            this.imageCache = new Map();
        }
    }

    // 初始化节流保存机制
    initSaveThrottle() {
        setInterval(async () => {
            if (this.cacheChanged) {
                await this.saveCacheToDatabase();
                this.cacheChanged = false;
            }
        }, 5000);
    }

    // 保存缓存到数据库
    async saveCacheToDatabase(force = false) {
        if (!force && !this.cacheChanged) return;

        try {
            // 这里我们只保存变更的数据，而不是全部重写
            // 实际的保存在analyzeImage方法中逐个进行
            console.log(`💾 图片缓存已同步到数据库`);
            this.cacheChanged = false;
        } catch (error) {
            console.error('❌ 保存缓存到数据库失败:', error.message);
        }
    }

    // 标记缓存已变更
    markCacheChanged() {
        this.cacheChanged = true;
    }

    // 初始化文件监控
    initWatcher() {
        if (!fs.existsSync(this.wallpaperPath)) {
            console.warn(`⚠️  壁纸目录不存在: ${this.wallpaperPath}`);
            return;
        }

        this.watcher = chokidar.watch(this.wallpaperPath, {
            ignored: /[\/\\]\./,
            persistent: true,
            ignoreInitial: false
        });

        this.watcher
            .on('add', (filePath) => this.handleFileChange(filePath, 'add'))
            .on('change', (filePath) => this.handleFileChange(filePath, 'change'))
            .on('unlink', (filePath) => this.handleFileChange(filePath, 'delete'))
            .on('ready', () => {
                console.log(`👁️  开始监控壁纸目录: ${this.wallpaperPath}`);
                this.processInitialScan();
            })
            .on('error', error => console.error(`❌ 文件监控错误:`, error));
    }

    // 处理文件变化
    async handleFileChange(filePath, action) {
        const ext = path.extname(filePath).toLowerCase();
        const supportedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        if (!supportedExts.includes(ext)) return;

        switch (action) {
            case 'add':
            case 'change':
                this.addToQueue(filePath);
                break;
            case 'delete':
                await this.removeFromDatabase(filePath);
                this.imageCache.delete(filePath);
                console.log(`🗑️  移除缓存: ${path.basename(filePath)}`);
                break;
        }
    }

    // 从数据库移除图片记录
    async removeFromDatabase(filePath) {
        try {
            await database.removeImageCache(filePath);
        } catch (error) {
            console.error('❌ 从数据库删除图片记录失败:', error);
        }
    }

    // 添加到处理队列
    addToQueue(filePath) {
        if (!this.queue.includes(filePath)) {
            this.queue.push(filePath);
        }
        this.processQueue();
    }

    // 处理队列
    async processQueue() {
        if (this.isAnalyzing || this.queue.length === 0) return;
        this.isAnalyzing = true;

        while (this.queue.length > 0) {
            const filePath = this.queue.shift();
            await this.analyzeImage(filePath);
        }

        this.isAnalyzing = false;
    }

    // 初始扫描处理
    async processInitialScan() {
        if (this.queue.length > 0) {
            console.log(`🔍 开始分析 ${this.queue.length} 张新图片...`);
            await this.processQueue();
            console.log(`✅ 初始扫描完成`);
        }
    }

    // 分析单张图片
    async analyzeImage(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                await this.removeFromDatabase(filePath);
                this.imageCache.delete(filePath);
                return;
            }

            const stats = fs.statSync(filePath);
            const cached = this.imageCache.get(filePath);

            // 检查文件是否已更新
            if (cached && cached.mtime === stats.mtime.getTime()) {
                return;
            }

            const fileNameRatio = this.guessRatioFromFileName(filePath);
            let imageInfo = {
                path: filePath,
                mtime: stats.mtime.getTime(),
                size: stats.size,
                fromFileName: !!fileNameRatio
            };

            if (fileNameRatio) {
                imageInfo = { ...imageInfo, ...fileNameRatio };
            } else {
                try {
                    const metadata = await sharp(filePath).metadata();
                    const aspectRatio = metadata.width / metadata.height;
                    imageInfo.width = metadata.width;
                    imageInfo.height = metadata.height;
                    imageInfo.aspectRatio = Math.round(aspectRatio * 100) / 100;
                    imageInfo.category = this.classifyRatio(aspectRatio);
                    imageInfo.format = metadata.format;
                } catch (sharpError) {
                    console.warn(`⚠️  Sharp分析失败 ${path.basename(filePath)}: ${sharpError.message}`);
                    imageInfo.category = 'widescreen';
                    imageInfo.aspectRatio = 1.78;
                }
            }

            // 保存到数据库
            await this.saveImageToDatabase(imageInfo);

            // 更新内存缓存
            this.imageCache.set(filePath, imageInfo);

            console.log(`📊 分析完成: ${path.basename(filePath)} - ${imageInfo.category} (${imageInfo.aspectRatio || 'unknown'})`);
        } catch (error) {
            console.error(`❌ 分析图片失败 ${path.basename(filePath)}: ${error.message}`);
        }
    }

    // 保存图片信息到数据库
    async saveImageToDatabase(imageInfo) {
        try {
            const imageData = {
                filePath: imageInfo.path,
                fileName: path.basename(imageInfo.path),
                width: imageInfo.width || null,
                height: imageInfo.height || null,
                aspectRatio: imageInfo.aspectRatio || null,
                category: imageInfo.category,
                format: imageInfo.format || null,
                fileSize: imageInfo.size,
                fileMtime: imageInfo.mtime,
                fromFileName: imageInfo.fromFileName || false,
                source: imageInfo.source || 'sharp_analysis'
            };

            await database.saveImageCache(imageData);
        } catch (error) {
            console.error('❌ 保存图片到数据库失败:', error);
        }
    }

    // 从文件名推测比例
    guessRatioFromFileName(filePath) {
        const fileName = path.basename(filePath).toLowerCase();

        const resolutionMatch = fileName.match(/(\d{3,5})[x_\-](\d{3,5})/);
        if (resolutionMatch) {
            const width = parseInt(resolutionMatch[1]);
            const height = parseInt(resolutionMatch[2]);
            if (width >= 100 && height >= 100 && width <= 8000 && height <= 8000) {
                const aspectRatio = Math.round((width / height) * 100) / 100;
                return {
                    width,
                    height,
                    aspectRatio,
                    category: this.classifyRatio(aspectRatio),
                    source: 'filename_resolution'
                };
            }
        }

        const ratioPatterns = {
            'ultrawide': /(?:ultra-?wide|21[:\-_]9|3440x1440|2560x1080)/,
            'widescreen': /(?:wide-?screen|16[:\-_]9|16[:\-_]10|1920x1080|2560x1440)/,
            'standard': /(?:standard|4[:\-_]3|5[:\-_]4|1024x768|1280x1024)/,
            'portrait': /(?:portrait|vertical|mobile|9[:\-_]16|1080x1920)/,
            'square': /(?:square|1[:\-_]1|1080x1080)/
        };

        for (const [category, pattern] of Object.entries(ratioPatterns)) {
            if (pattern.test(fileName)) {
                const defaultRatios = {
                    'ultrawide': 2.39,
                    'widescreen': 1.78,
                    'standard': 1.33,
                    'portrait': 0.56,
                    'square': 1.0
                };
                return {
                    aspectRatio: defaultRatios[category],
                    category,
                    source: 'filename_pattern'
                };
            }
        }

        return null;
    }

    // 分类比例
    classifyRatio(aspectRatio) {
        if (aspectRatio >= 2.35) return 'ultrawide';
        if (aspectRatio >= 1.65) return 'widescreen';
        if (aspectRatio >= 1.15) return 'standard';
        if (aspectRatio >= 0.8) return 'portrait';
        return 'square';
    }

    // 根据比例获取图片列表
    async getImagesByRatio(targetRatio) {
        try {
            // 优先从数据库获取最新数据
            const dbImages = await database.getImagesByRatio(targetRatio);

            if (dbImages.length > 0) {
                // 验证文件是否仍然存在
                const validImages = [];
                for (const imagePath of dbImages) {
                    if (fs.existsSync(imagePath)) {
                        validImages.push(imagePath);
                    } else {
                        // 文件不存在，从数据库删除
                        await this.removeFromDatabase(imagePath);
                        this.imageCache.delete(imagePath);
                    }
                }
                return validImages;
            }

            // 如果数据库中没有，则从内存缓存获取
            return this.getImagesFromMemoryCache(targetRatio);
        } catch (error) {
            console.error('❌ 从数据库获取图片失败:', error);
            // fallback到内存缓存
            return this.getImagesFromMemoryCache(targetRatio);
        }
    }

    // 从内存缓存获取图片（作为fallback）
    getImagesFromMemoryCache(targetRatio) {
        const exactMatches = [];
        const closeMatches = [];
        const fallbackMatches = [];
        const targetNumericRatio = this.getNumericRatio(targetRatio);

        for (const [filePath, info] of this.imageCache.entries()) {
            if (!fs.existsSync(filePath)) {
                this.imageCache.delete(filePath);
                this.removeFromDatabase(filePath);
                continue;
            }

            if (info.category === targetRatio) {
                exactMatches.push({
                    path: filePath,
                    aspectRatio: info.aspectRatio,
                    score: 100,
                    matchType: 'exact'
                });
            } else if (info.aspectRatio) {
                const difference = Math.abs(info.aspectRatio - targetNumericRatio);
                const score = Math.max(0, 100 - difference * 30);
                if (score >= 70) {
                    closeMatches.push({
                        path: filePath,
                        aspectRatio: info.aspectRatio,
                        score,
                        matchType: 'close'
                    });
                } else if (score >= 40) {
                    fallbackMatches.push({
                        path: filePath,
                        aspectRatio: info.aspectRatio,
                        score,
                        matchType: 'fallback'
                    });
                }
            }
        }

        let selectedMatches = [];
        if (exactMatches.length > 0) {
            selectedMatches = exactMatches;
        } else if (closeMatches.length > 0) {
            selectedMatches = closeMatches;
        } else if (fallbackMatches.length > 0) {
            selectedMatches = fallbackMatches;
        }

        selectedMatches.sort((a, b) => b.score - a.score);
        return selectedMatches.map(img => img.path);
    }

    // 获取数值比例
    getNumericRatio(ratioCategory) {
        const ratioMap = {
            'ultrawide': 2.39,
            'widescreen': 1.78,
            'standard': 1.33,
            'portrait': 0.56,
            'square': 1.0
        };
        return ratioMap[ratioCategory] || 1.78;
    }

    // 获取统计信息
    async getStatistics() {
        try {
            const imageStats = await database.getImageStats();

            const stats = {
                totalImages: this.imageCache.size,
                ratioDistribution: {},
                lastUpdated: new Date().toISOString(),
                dataSource: 'sqlite_database'
            };

            // 初始化所有比例类型
            for (const category of Object.keys(this.ratioMap)) {
                stats.ratioDistribution[category] = {
                    count: 0,
                    images: []
                };
            }

            // 填充统计数据
            for (const stat of imageStats) {
                if (stats.ratioDistribution[stat.category]) {
                    stats.ratioDistribution[stat.category].count = stat.count;
                }
            }

            return stats;
        } catch (error) {
            console.error('❌ 获取统计信息失败:', error);
            // fallback到内存统计
            return this.getMemoryStatistics();
        }
    }

    // 内存统计（作为fallback）
    getMemoryStatistics() {
        const stats = {
            totalImages: this.imageCache.size,
            ratioDistribution: {},
            lastUpdated: new Date().toISOString(),
            dataSource: 'memory_cache'
        };

        for (const category of Object.keys(this.ratioMap)) {
            stats.ratioDistribution[category] = {
                count: 0,
                images: []
            };
        }

        for (const [filePath, info] of this.imageCache.entries()) {
            if (!fs.existsSync(filePath)) {
                this.imageCache.delete(filePath);
                this.removeFromDatabase(filePath);
                continue;
            }

            if (stats.ratioDistribution[info.category]) {
                stats.ratioDistribution[info.category].count++;
                stats.ratioDistribution[info.category].images.push({
                    file: path.basename(filePath),
                    ratio: info.aspectRatio,
                    size: info.width && info.height ? `${info.width}x${info.height}` : 'unknown'
                });
            }
        }

        return stats;
    }

    // 强制重新分析所有图片
    async forceReanalyze() {
        console.log('🔄 开始强制重新分析所有图片...');

        // 清空内存缓存
        this.imageCache.clear();

        // 清空数据库缓存
        try {
            await database.clearImageCache();
        } catch (error) {
            console.error('❌ 清空数据库缓存失败:', error);
        }

        // 重新扫描所有文件
        const files = this.getAllImageFiles(this.wallpaperPath);
        this.queue = files;
        await this.processQueue();

        console.log('✅ 强制重新分析完成');
    }

    // 获取所有图片文件
    getAllImageFiles(dir) {
        const files = [];
        const supportedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

        function scanDir(currentDir) {
            if (!fs.existsSync(currentDir)) return;
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    scanDir(fullPath);
                } else if (entry.isFile() && supportedExts.includes(path.extname(entry.name).toLowerCase())) {
                    files.push(fullPath);
                }
            }
        }

        scanDir(dir);
        return files;
    }

    // 清理缓存
    async cleanupCache() {
        let removed = 0;
        for (const filePath of this.imageCache.keys()) {
            if (!fs.existsSync(filePath)) {
                this.imageCache.delete(filePath);
                await this.removeFromDatabase(filePath);
                removed++;
            }
        }
        if (removed > 0) {
            console.log(`🧹 清理缓存: 移除 ${removed} 个无效记录`);
        }
        return removed;
    }

    // 销毁实例
    async destroy() {
        if (this.watcher) {
            this.watcher.close();
        }
        // 最后一次保存
        await this.saveCacheToDatabase(true);
    }
}

export default ImageAnalyzer;