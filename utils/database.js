import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Database {
    constructor() {
        this.dataDir = path.join(__dirname, '../data');
        this.dbPath = path.join(this.dataDir, 'api_records.db');
        this.db = null;
        this.isInitialized = false;
        this.initPromise = null;

        this.ensureDataDir();
        this.initPromise = this.initDatabase();
    }

    // 确保数据库已初始化
    async ensureInitialized() {
        if (!this.isInitialized) {
            await this.initPromise;
        }
        return this.isInitialized;
    }

    // 确保data目录存在
    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
            console.log('📁 创建data目录');
        }
    }

    // 初始化数据库
    async initDatabase() {
        try {
            await new Promise((resolve, reject) => {
                this.db = new sqlite3.Database(this.dbPath, (err) => {
                    if (err) {
                        console.error('❌ 打开数据库失败:', err.message);
                        reject(err);
                        return;
                    }
                    console.log('📊 连接到SQLite数据库');
                    resolve();
                });
            });

            await this.createTables();
            await this.initSystemStats();

            this.isInitialized = true;
            console.log('✅ 数据库初始化完成');

        } catch (error) {
            console.error('❌ 数据库初始化失败:', error);
            this.isInitialized = false;
            throw error;
        }
    }

    // 创建表结构
    async createTables() {
        if (!this.db) throw new Error('数据库连接未建立');

        const queries = [
            // API调用记录表
            `CREATE TABLE IF NOT EXISTS api_calls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                endpoint TEXT NOT NULL,
                method TEXT NOT NULL,
                path TEXT NOT NULL,
                query_params TEXT,
                user_agent TEXT,
                response_time INTEGER DEFAULT 0,
                status_code INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // API端点统计表
            `CREATE TABLE IF NOT EXISTS endpoint_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint TEXT UNIQUE NOT NULL,
                total_calls INTEGER DEFAULT 0,
                total_response_time INTEGER DEFAULT 0,
                avg_response_time INTEGER DEFAULT 0,
                last_called DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // 系统统计表
            `CREATE TABLE IF NOT EXISTS system_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                total_calls INTEGER DEFAULT 0,
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_update DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // 图片缓存表
            `CREATE TABLE IF NOT EXISTS image_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT UNIQUE NOT NULL,
                file_name TEXT NOT NULL,
                width INTEGER,
                height INTEGER,
                aspect_ratio REAL,
                category TEXT,
                format TEXT,
                file_size INTEGER,
                file_mtime INTEGER,
                from_filename BOOLEAN DEFAULT 0,
                source TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // 目录访问记录表
            `CREATE TABLE IF NOT EXISTS directory_access (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                directory_name TEXT NOT NULL,
                directory_type TEXT NOT NULL,
                access_count INTEGER DEFAULT 1,
                last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(directory_name, directory_type)
            )`
        ];

        for (const query of queries) {
            await new Promise((resolve, reject) => {
                this.db.run(query, (err) => {
                    if (err) {
                        console.error('❌ 创建表失败:', err.message);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }

        console.log('✅ 数据库表创建完成');
    }

    // 初始化系统统计
    async initSystemStats() {
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM system_stats LIMIT 1', (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!row) {
                    this.db.run(
                        'INSERT INTO system_stats (total_calls, start_time, last_update) VALUES (0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
                        (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve();
                            }
                        }
                    );
                } else {
                    resolve();
                }
            });
        });
    }


    // 获取所有图片缓存
    async getAllImageCache() {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM image_cache ORDER BY file_path',
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // 删除图片缓存记录
    async removeImageCache(filePath) {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM image_cache WHERE file_path = ?',
                [filePath],
                function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                }
            );
        });
    }

    // 清空图片缓存
    async clearImageCache() {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM image_cache',
                function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                }
            );
        });
    }

    // 记录API调用
    async logApiCall(callData) {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            const {
                endpoint,
                method,
                path,
                query,
                userAgent,
                responseTime,
                statusCode
            } = callData;

            this.db.run(
                `INSERT INTO api_calls 
                (endpoint, method, path, query_params, user_agent, response_time, status_code)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [endpoint, method, path, JSON.stringify(query || {}), userAgent, responseTime, statusCode],
                function (err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(this.lastID);
                }
            );
        });
    }

    // 更新端点统计
    async updateEndpointStats(endpoint, responseTime) {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            // 使用INSERT OR IGNORE + UPDATE的组合来避免UNIQUE约束冲突
            this.db.serialize(() => {
                // 首先尝试插入新记录（如果不存在）
                this.db.run(
                    `INSERT OR IGNORE INTO endpoint_stats 
                (endpoint, total_calls, total_response_time, avg_response_time, last_called)
                VALUES (?, 0, 0, 0, CURRENT_TIMESTAMP)`,
                    [endpoint],
                    (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        // 然后更新统计数据
                        this.db.run(
                            `UPDATE endpoint_stats 
                        SET total_calls = total_calls + 1,
                            total_response_time = total_response_time + ?,
                            avg_response_time = CASE 
                                WHEN total_calls > 0 THEN (total_response_time + ?) / total_calls
                                ELSE ?
                            END,
                            last_called = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE endpoint = ?`,
                            [responseTime, responseTime, responseTime, endpoint],
                            (err) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            }
                        );
                    }
                );
            });
        });
    }

    // 更新系统总统计
    async updateSystemStats() {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE system_stats SET total_calls = total_calls + 1, last_update = CURRENT_TIMESTAMP',
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    // 记录目录访问
    async logDirectoryAccess(directoryName, directoryType) {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            // 使用INSERT OR REPLACE的更简单方式
            this.db.run(
                `INSERT OR REPLACE INTO directory_access 
                (directory_name, directory_type, access_count, last_accessed) 
                VALUES (
                    ?, 
                    ?, 
                    COALESCE((SELECT access_count FROM directory_access WHERE directory_name = ? AND directory_type = ?), 0) + 1,
                    CURRENT_TIMESTAMP
                )`,
                [directoryName, directoryType, directoryName, directoryType],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    // 获取系统统计
    async getSystemStats() {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM system_stats LIMIT 1', (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || {
                        total_calls: 0,
                        start_time: new Date().toISOString(),
                        last_update: new Date().toISOString()
                    });
                }
            });
        });
    }

    // 获取端点统计
    async getEndpointStats(limit = 10) {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM endpoint_stats ORDER BY total_calls DESC LIMIT ?',
                [limit],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // 获取最近调用记录
    async getRecentCalls(limit = 50) {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM api_calls 
                ORDER BY timestamp DESC 
                LIMIT ?`,
                [limit],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // 获取目录访问统计
    async getDirectoryStats() {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT directory_name, directory_type, access_count, last_accessed 
                FROM directory_access 
                ORDER BY access_count DESC`,
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // 获取图片统计
    async getImageStats() {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT category, COUNT(*) as count 
                FROM image_cache 
                GROUP BY category 
                ORDER BY count DESC`,
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // 保存图片缓存
    async saveImageCache(imageData) {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            const {
                filePath, fileName, width, height, aspectRatio,
                category, format, fileSize, fileMtime, fromFileName, source
            } = imageData;

            this.db.run(
                `INSERT OR REPLACE INTO image_cache 
                (file_path, file_name, width, height, aspect_ratio, category, format, 
                file_size, file_mtime, from_filename, source, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [filePath, fileName, width, height, aspectRatio, category, format,
                    fileSize, fileMtime, fromFileName ? 1 : 0, source],
                function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
    }

    // 获取图片缓存
    async getImagesByRatio(category) {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT file_path FROM image_cache WHERE category = ? ORDER BY aspect_ratio',
                [category],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows ? rows.map(row => row.file_path) : []);
                    }
                }
            );
        });
    }

    // 清理旧记录
    async cleanup(daysToKeep = 30) {
        await this.ensureInitialized();
        if (!this.db) throw new Error('数据库连接未建立');

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const cutoffISO = cutoffDate.toISOString();

        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM api_calls WHERE timestamp < ?',
                [cutoffISO],
                function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        console.log(`🧹 清理了 ${this.changes} 条旧API调用记录`);
                        resolve(this.changes);
                    }
                }
            );
        });
    }

    // 关闭数据库连接
    async close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('❌ 关闭数据库失败:', err.message);
                    } else {
                        console.log('📊 数据库连接已关闭');
                    }
                    this.isInitialized = false;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

const instance = new Database();
export default instance;