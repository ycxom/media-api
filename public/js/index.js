// 分类展开状态管理
const categoryStates = {
    picture: {
        mainExpanded: false,
        allExpanded: false,
        expandedCategories: new Set()
    },
    video: {
        mainExpanded: false,
        allExpanded: false,
        expandedCategories: new Set()
    }
};

// 切换主分类显示/隐藏
function toggleCategory(type) {
    const contentId = type + 'Content';
    const content = document.getElementById(contentId);
    const button = content.previousElementSibling.querySelector('.category-toggle');
    const icon = button.querySelector('.icon');
    const span = button.querySelector('span');

    const mediaType = type.includes('picture') ? 'picture' : 'video';

    if (categoryStates[mediaType].mainExpanded) {
        // 收起
        content.classList.remove('expanded');
        icon.style.transform = 'rotate(0deg)';
        span.textContent = '展开分类';
        categoryStates[mediaType].mainExpanded = false;
        button.classList.remove('expanded');
    } else {
        // 展开
        content.classList.add('expanded');
        icon.style.transform = 'rotate(180deg)';
        span.textContent = '收起分类';
        categoryStates[mediaType].mainExpanded = true;
        button.classList.add('expanded');
    }
}

// 切换单个分类的展开/收起
function toggleSingleCategory(categoryName, type) {
    const categoryElement = document.querySelector(`[data-category="${categoryName}"][data-type="${type}"]`);
    if (!categoryElement) return;

    const dirsElement = categoryElement.querySelector('.category-dirs');
    const isExpanded = categoryStates[type].expandedCategories.has(categoryName);

    if (isExpanded) {
        dirsElement.style.display = 'none';
        categoryStates[type].expandedCategories.delete(categoryName);
        categoryElement.querySelector('.category-title').style.opacity = '0.7';
    } else {
        dirsElement.style.display = 'flex';
        categoryStates[type].expandedCategories.add(categoryName);
        categoryElement.querySelector('.category-title').style.opacity = '1';
    }

    updateGlobalToggleButton(type);
}

// 全部展开/收起
function toggleAllCategories(type) {
    const isAllExpanded = categoryStates[type].allExpanded;
    const categories = document.querySelectorAll(`[data-type="${type}"]`);

    categories.forEach(categoryElement => {
        const categoryName = categoryElement.getAttribute('data-category');
        const dirsElement = categoryElement.querySelector('.category-dirs');
        const titleElement = categoryElement.querySelector('.category-title');

        if (isAllExpanded) {
            // 全部收起
            dirsElement.style.display = 'none';
            categoryStates[type].expandedCategories.delete(categoryName);
            titleElement.style.opacity = '0.7';
        } else {
            // 全部展开
            dirsElement.style.display = 'flex';
            categoryStates[type].expandedCategories.add(categoryName);
            titleElement.style.opacity = '1';
        }
    });

    categoryStates[type].allExpanded = !isAllExpanded;
    updateGlobalToggleButton(type);
}

// 更新全局切换按钮文本
function updateGlobalToggleButton(type) {
    const toggleText = document.getElementById(type + 'GlobalToggleText');
    if (categoryStates[type].allExpanded) {
        toggleText.textContent = '收起全部';
    } else {
        toggleText.textContent = '展开全部';
    }
}

// 图片轮播管理类（增强版）
class AdvancedImageSlideshow {
    constructor(containerId, imageCount = 5, interval = 5000) {
        this.container = document.getElementById(containerId);
        this.imageCount = imageCount;
        this.interval = interval;
        this.currentIndex = 0;
        this.slides = [];
        this.effects = ['flip', 'cube', 'wave', 'split', 'spiral', 'mirror'];
        this.effectNames = ['3D翻转', '立方体', '波浪', '分割', '螺旋', '镜像'];
        this.currentEffect = 0;
        this.isHeader = containerId === 'headerSlideshow';
        this.init();
    }
    async init() {
        try {
            // 创建图片元素
            for (let i = 0; i < this.imageCount; i++) {
                const slide = document.createElement('div');
                slide.className = this.isHeader ? 'header-slide' : 'bg-slide';

                // 预加载图片
                const img = new Image();
                const imageUrl = `/picture?cache=${Date.now()}_${i}`;

                img.onload = () => {
                    slide.style.backgroundImage = `url(${imageUrl})`;
                    if (i === 0) {
                        slide.classList.add('active');
                    }
                };

                img.onerror = () => {
                    // 如果图片加载失败，使用渐变背景
                    slide.style.background = `linear-gradient(${45 + i * 30}deg, 
                        hsl(${200 + i * 30}, 70%, 50%), 
                        hsl(${250 + i * 20}, 60%, 40%))`;
                    if (i === 0) {
                        slide.classList.add('active');
                    }
                };

                img.src = imageUrl;
                this.container.appendChild(slide);
                this.slides.push(slide);
            }
            // 设置初始效果
            if (this.isHeader) {
                this.setEffect(this.effects[0]);
            }
            // 开始轮播
            setTimeout(() => {
                this.startSlideshow();
            }, 1000);
        } catch (error) {
            console.error('初始化轮播失败:', error);
            this.createFallbackSlides();
        }
    }
    createFallbackSlides() {
        // 创建备用渐变背景
        for (let i = 0; i < this.imageCount; i++) {
            const slide = document.createElement('div');
            slide.className = this.isHeader ? 'header-slide' : 'bg-slide';
            slide.style.background = `linear-gradient(${45 + i * 30}deg, 
                hsl(${200 + i * 30}, 70%, 50%), 
                hsl(${250 + i * 20}, 60%, 40%))`;

            if (i === 0) {
                slide.classList.add('active');
            }

            this.container.appendChild(slide);
            this.slides.push(slide);
        }

        if (this.isHeader) {
            this.setEffect(this.effects[0]);
        }

        this.startSlideshow();
    }
    setEffect(effectName) {
        if (!this.isHeader) return;

        // 移除之前的效果类
        this.effects.forEach(effect => {
            this.container.classList.remove(`effect-${effect}`);
        });

        // 添加新的效果类
        this.container.classList.add(`effect-${effectName}`);

        // 更新指示器
        const indicator = document.getElementById('effectIndicator');
        if (indicator) {
            const effectIndex = this.effects.indexOf(effectName);
            indicator.textContent = this.effectNames[effectIndex] || effectName;

            // 添加闪烁效果
            indicator.style.animation = 'none';
            setTimeout(() => {
                indicator.style.animation = 'fadeIn 0.5s ease-in-out';
            }, 10);
        }
    }
    startSlideshow() {
        setInterval(() => {
            this.nextSlide();
        }, this.interval);
    }
    nextSlide() {
        if (this.slides.length === 0) return;

        const prevIndex = this.currentIndex;
        const nextIndex = (this.currentIndex + 1) % this.slides.length;

        // 设置状态类
        this.slides.forEach((slide, index) => {
            slide.classList.remove('prev', 'active', 'next');

            if (index === prevIndex) {
                slide.classList.add('prev');
            } else if (index === nextIndex) {
                slide.classList.add('active');
            } else if (index === (nextIndex + 1) % this.slides.length) {
                slide.classList.add('next');
            }
        });

        this.currentIndex = nextIndex;

        // 头部轮播每3次切换一次效果
        if (this.isHeader && this.currentIndex % 3 === 0) {
            this.currentEffect = (this.currentEffect + 1) % this.effects.length;
            setTimeout(() => {
                this.setEffect(this.effects[this.currentEffect]);
            }, 500); // 在切换中间改变效果
        }
    }
}
// 背景图片轮播管理类（保持简单）
class BackgroundSlideshow {
    constructor(containerId, imageCount = 5, interval = 6000) {
        this.container = document.getElementById(containerId);
        this.imageCount = imageCount;
        this.interval = interval;
        this.currentIndex = 0;
        this.slides = [];
        this.init();
    }
    async init() {
        try {
            for (let i = 0; i < this.imageCount; i++) {
                const slide = document.createElement('div');
                slide.className = 'bg-slide';

                const img = new Image();
                const imageUrl = `/picture?cache=${Date.now()}_bg_${i}`;

                img.onload = () => {
                    slide.style.backgroundImage = `url(${imageUrl})`;
                    if (i === 0) {
                        slide.classList.add('active');
                    }
                };

                img.onerror = () => {
                    slide.style.background = `linear-gradient(${45 + i * 30}deg, 
                        hsl(${200 + i * 30}, 70%, 50%), 
                        hsl(${250 + i * 20}, 60%, 40%))`;
                    if (i === 0) {
                        slide.classList.add('active');
                    }
                };

                img.src = imageUrl;
                this.container.appendChild(slide);
                this.slides.push(slide);
            }
            setTimeout(() => {
                this.startSlideshow();
            }, 1000);
        } catch (error) {
            console.error('初始化背景轮播失败:', error);
        }
    }
    startSlideshow() {
        setInterval(() => {
            this.nextSlide();
        }, this.interval);
    }
    nextSlide() {
        if (this.slides.length === 0) return;

        this.slides[this.currentIndex].classList.remove('active');
        this.currentIndex = (this.currentIndex + 1) % this.slides.length;
        this.slides[this.currentIndex].classList.add('active');
    }
}

// 渲染分类标签（增强版）
function renderCategories(categories, containerId, type) {
    const container = document.getElementById(containerId);
    if (!categories || Object.keys(categories).length === 0) {
        container.innerHTML = '<span class="error">暂无分类</span>';
        return;
    }

    let html = '';
    Object.entries(categories).forEach(([categoryName, dirs]) => {
        if (dirs && dirs.length > 0) {
            html += `
                <div class="category-section" data-category="${categoryName}" data-type="${type}">
                    <div class="category-title" onclick="toggleSingleCategory('${categoryName}', '${type}')" style="cursor: pointer;">
                        ${categoryName}
                        <div class="category-stats">${dirs.length} 项</div>
                    </div>
                    <div class="dir-tags" style="margin-bottom: 0.8rem;">
                        <a href="/api/random/${type}/${encodeURIComponent(categoryName)}" 
                           class="dir-tag category-tag" 
                           target="_blank" 
                           title="随机获取${categoryName}分类的${type === 'picture' ? '图片' : '视频'}">
                           🎲 ${categoryName}
                        </a>
                    </div>
                    <div class="category-dirs" style="display: none;">
                        ${dirs.map(dir =>
                `<a href="/${type}/${encodeURIComponent(dir)}" 
                               class="category-dir-tag" 
                               target="_blank" 
                               title="获取 ${dir} 目录的随机${type === 'picture' ? '图片' : '视频'}">${dir}</a>`
            ).join('')}
                    </div>
                </div>
            `;
        }
    });

    container.innerHTML = html || '<span class="error">暂无可用分类</span>';
}

// 加载目录数据
function loadDirectories() {
    fetch('/api/list')
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(data => {

            // 渲染图片分类
            renderCategories(data.pictureCategories, 'pictureCategories', 'picture');

            // 渲染视频分类
            renderCategories(data.videoCategories, 'videoCategories', 'video');

            // 处理图片目录
            const picDirsElement = document.getElementById('pictureDirs');
            if (data.pictureDirs && data.pictureDirs.length > 0) {
                const picDirs = data.pictureDirs.map(dir =>
                    `<a href="/picture/${encodeURIComponent(dir)}" class="dir-tag" target="_blank" title="获取 ${dir} 目录的随机图片">${dir}</a>`
                ).join('');
                picDirsElement.innerHTML = picDirs;
            } else {
                picDirsElement.innerHTML = '<span class="error">暂无可用目录</span>';
            }
            // 处理视频目录
            const vidDirsElement = document.getElementById('videoDirs');
            if (data.videoDirs && data.videoDirs.length > 0) {
                const vidDirs = data.videoDirs.map(dir =>
                    `<a href="/video/${encodeURIComponent(dir)}" class="dir-tag" target="_blank" title="获取 ${dir} 目录的随机视频">${dir}</a>`
                ).join('');
                vidDirsElement.innerHTML = vidDirs;
            } else {
                vidDirsElement.innerHTML = '<span class="error">暂无可用目录</span>';
            }
        })
        .catch(error => {
            console.error('❌ 加载目录失败:', error);
            document.getElementById('pictureCategories').innerHTML = '<span class="error">加载失败，请检查服务器连接</span>';
            document.getElementById('videoCategories').innerHTML = '<span class="error">加载失败，请检查服务器连接</span>';
            document.getElementById('pictureDirs').innerHTML = '<span class="error">加载失败，请检查服务器连接</span>';
            document.getElementById('videoDirs').innerHTML = '<span class="error">加载失败，请检查服务器连接</span>';
        });
}
// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function () {

    // 初始化背景轮播
    new BackgroundSlideshow('bgSlideshow', 5, 6000);

    // 初始化头部高级轮播
    new AdvancedImageSlideshow('headerSlideshow', 10, 4000);

    // 加载目录数据
    loadDirectories();
});