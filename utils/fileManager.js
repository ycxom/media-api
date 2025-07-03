import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FileManager {
    constructor() {
        this.dataDir = path.join(__dirname, '../data');
        this.ensureDataDir();
    }

    // 确保data目录存在
    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
            console.log('📁 创建data目录');
        }
    }

    // 获取data目录路径
    getDataDir() {
        return this.dataDir;
    }

    // 获取data目录下的文件路径
    getDataFilePath(filename) {
        return path.join(this.dataDir, filename);
    }

    // 确保文件存在，如果不存在则创建默认内容
    ensureFileExists(filename, defaultContent) {
        const filePath = this.getDataFilePath(filename);
        if (!fs.existsSync(filePath)) {
            try {
                const content = typeof defaultContent === 'object' 
                    ? JSON.stringify(defaultContent, null, 2)
                    : defaultContent;
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`📄 创建文件: ${filename}`);
                return true;
            } catch (error) {
                console.error(`❌ 创建文件失败 ${filename}:`, error.message);
                return false;
            }
        }
        return false; // 文件已存在
    }

    // 读取JSON文件
    readJsonFile(filename) {
        const filePath = this.getDataFilePath(filename);
        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            console.error(`❌ 读取JSON文件失败 ${filename}:`, error.message);
            return null;
        }
    }

    // 写入JSON文件
    writeJsonFile(filename, data) {
        const filePath = this.getDataFilePath(filename);
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error(`❌ 写入JSON文件失败 ${filename}:`, error.message);
            return false;
        }
    }

    // 检查文件是否存在
    fileExists(filename) {
        return fs.existsSync(this.getDataFilePath(filename));
    }

    // 获取文件统计信息
    getFileStats(filename) {
        const filePath = this.getDataFilePath(filename);
        try {
            if (fs.existsSync(filePath)) {
                return fs.statSync(filePath);
            }
            return null;
        } catch (error) {
            console.error(`❌ 获取文件统计信息失败 ${filename}:`, error.message);
            return null;
        }
    }

    // 清理旧文件
    cleanupOldFiles(pattern, daysToKeep = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            
            const files = fs.readdirSync(this.dataDir);
            let removedCount = 0;
            
            files.forEach(file => {
                if (file.match(pattern)) {
                    const filePath = path.join(this.dataDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.mtime < cutoffDate) {
                        fs.unlinkSync(filePath);
                        removedCount++;
                        console.log(`🗑️  删除旧文件: ${file}`);
                    }
                }
            });
            
            return removedCount;
        } catch (error) {
            console.error('❌ 清理旧文件失败:', error.message);
            return 0;
        }
    }

    // 获取目录大小
    getDirectorySize() {
        try {
            let totalSize = 0;
            const files = fs.readdirSync(this.dataDir);
            
            files.forEach(file => {
                const filePath = path.join(this.dataDir, file);
                const stats = fs.statSync(filePath);
                totalSize += stats.size;
            });
            
            return totalSize;
        } catch (error) {
            console.error('❌ 获取目录大小失败:', error.message);
            return 0;
        }
    }

    // 格式化文件大小
    formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    // 获取data目录信息
    getDirectoryInfo() {
        try {
            const files = fs.readdirSync(this.dataDir);
            const totalSize = this.getDirectorySize();
            
            const fileInfo = files.map(file => {
                const filePath = path.join(this.dataDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    size: this.formatFileSize(stats.size),
                    modified: stats.mtime.toISOString(),
                    created: stats.birthtime.toISOString()
                };
            });
            
            return {
                path: this.dataDir,
                totalFiles: files.length,
                totalSize: this.formatFileSize(totalSize),
                files: fileInfo
            };
        } catch (error) {
            console.error('❌ 获取目录信息失败:', error.message);
            return null;
        }
    }
}

// 导出单例
const instance = new FileManager();
export default instance;