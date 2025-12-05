import ExClient from '../components/Core.js';
import plugin from '../../../lib/plugins/plugin.js';
import { CATEGORY } from '../components/Core.js';

const USER_SEARCH_PARAM_KEY = 'Yz:Exloli-plugin:search:';
const NOT_MASTER_REPLY = '臭萝莉控滚开啊！变态！！';
const SEARCH_TIMEOUT = 60;

export class Search extends plugin {
    constructor() {
        super({
            name: 'ExLoli-搜索',
            dsc: 'ExLoli 搜索',
            event: 'message',
            priority: 1009,
            rule: [{
                reg: '^#?exloli搜索$',
                fnc: 'search'
            }, {
                reg: '^#?exloli(上|下|第|最后)一页$',
                fnc: 'changePage'
            }]
        });
    }

    async search(e) {
        if (!e.isMaster) {
            e.reply(NOT_MASTER_REPLY);
            return true;
        }
        
        e.reply(`请输入搜索参数，用空格分隔（可直接复制粘贴）：

格式：关键词1,关键词2... 漫画类型序号 星级 是否里站
示例：
1. 默认设置：默认
2. 仅关键词：萝莉 原神
3. 完整示例：萝莉 1,2,4 3 是

详细参数说明：
📝 关键词：用逗号分隔，空关键词填"无"或直接留空
📂 漫画类型：用逗号分隔序号，不填或"默认"则默认全选
   1.同人 2.漫画 3.美术CG 4.游戏CG 5.欧美 6.无H 7.图集 8.Coser 9.亚洲 10.杂项
⭐ 星级：0-5，不填或"默认"则为0
🏠 里站：是/否，不填默认为否

回复示例：
"萝莉,原神 1,2,4 3 是"
"默认"
"美少女 无H 2 否"`);
        
        const userId = e.user_id;
        const defaultParam = { step: 0 };
        await redis.set(USER_SEARCH_PARAM_KEY + userId, JSON.stringify(defaultParam), { EX: SEARCH_TIMEOUT });
        this.setContext("parseSearchParams", e.isGroup, SEARCH_TIMEOUT, "操作已超时，请重新发送指令");
        return true;
    }

    async parseSearchParams() {
        const userId = this.e.user_id;
        const paramKey = USER_SEARCH_PARAM_KEY + userId;
        const cachedParam = await redis.get(paramKey);
        if (!cachedParam) {
            this.finish("parseSearchParams", this.e.isGroup);
            return this.e.reply("搜索参数已过期，请重新发送 #exloli搜索");
        }

        const userParam = JSON.parse(cachedParam);
        const msg = this.e.msg.trim();

        try {
            // 解析参数：关键词 漫画类型 星级 是否里站
            let [keywordsStr, categoryStr, starStr, exStr] = msg.split(/\s+/).map(s => s.trim());

            // 处理默认情况
            if (msg.includes("默认") || msg === "") {
                userParam.search_param = [];
                userParam.category = {};
                userParam.f_srdd = 0;
                userParam.isEx = false;
            } else {
                // 解析关键词
                if (!keywordsStr || keywordsStr === "无") {
                    userParam.search_param = [""];
                } else {
                    userParam.search_param = keywordsStr.split(/[，,]/).map(s => s.trim()).filter(Boolean);
                }

                // 解析漫画类型
                if (!categoryStr || categoryStr === "默认") {
                    userParam.category = {};
                } else if (categoryStr === "全选") {
                    userParam.category = Object.fromEntries(Object.values(CATEGORY).map(key => [key, true]));
                } else {
                    userParam.category = Object.fromEntries(Object.values(CATEGORY).map(key => [key, false]));
                    const numbers = categoryStr.split(/[，,]/).map(s => s.trim());
                    numbers.forEach(num => {
                        const numVal = parseInt(num);
                        if (!isNaN(numVal) && numVal >= 1 && numVal <= 10 && CATEGORY[numVal]) {
                            userParam.category[CATEGORY[numVal]] = true;
                        }
                    });
                }

                // 解析星级
                if (!starStr || starStr === "默认") {
                    userParam.f_srdd = 0;
                } else {
                    const star = parseInt(starStr);
                    userParam.f_srdd = (!isNaN(star) && star >= 0 && star <= 5) ? star : 0;
                }

                // 解析里站
                userParam.isEx = exStr === "是" || exStr === "yes" || exStr === "true";
            }

            // 执行搜索
            this.finish("parseSearchParams", this.e.isGroup);
            await redis.del(paramKey);
            
            await this.e.reply("正在为您搜索中喵~");
            const exClient = new ExClient(userParam.isEx);
            const page = await exClient.requestPage(exClient.handleParam(userParam));
            
            if (page.comicList.length === 0) {
                await this.e.reply("未搜索到结果喵~");
            } else {
                await redis.set(USER_SEARCH_PARAM_KEY + userId + ':page', JSON.stringify(page), { EX: 3600 });
                this.e.reply(Bot.makeForwardMsg(this.createPageMessage(page.comicList)));
            }
            
        } catch (error) {
            await this.e.reply(`参数解析出错，请检查格式：
示例："萝莉,原神 1,2,4 3 是"
或回复"默认"使用默认设置`);
        }
    }

    async changePage(e) {
        const userId = this.e.user_id;
        const cachedPage = await redis.get(USER_SEARCH_PARAM_KEY + userId + ':page');
        if (!cachedPage) return e.reply("你上次还未搜索过内容或者记录太久远了喵~");

        let page = JSON.parse(cachedPage);
        let pageType;

        if (e.msg.includes("上")) {
            pageType = page.prev ? "prev" : null;
            if (pageType) e.reply("正在搜索上一页的内容喵~");
            else return e.reply("当前页没有上一页喵~");
        } else if (e.msg.includes("下")) {
            pageType = page.next ? "next" : null;
            if (pageType) e.reply("正在搜索下一页的内容喵~");
            else return e.reply("当前页没有下一页喵~");
        } else if (e.msg.includes("第一")) {
            pageType = page.first ? "first" : null;
            if (pageType) e.reply("正在搜索第一页的内容喵~");
            else return e.reply("当前页不能去到第一页喵~");
        } else if (e.msg.includes("最后")) {
            pageType = page.last ? "last" : null;
            if (pageType) e.reply("正在搜索最后一页的内容喵~");
            else return e.reply("当前页不能去到最后一页喵~");
        }

        if (pageType) {
            const exClient = new ExClient(page[pageType].includes("exhentai.org"));
            const newPage = await exClient.requestPage(exClient.handleParam({ ...page, type: pageType }));
            if (newPage.comicList.length === 0) {
                await this.e.reply("未搜索到结果");
            } else {
                await redis.set(USER_SEARCH_PARAM_KEY + userId + ':page', JSON.stringify(newPage), { EX: 3600 });
                this.e.reply(Bot.makeForwardMsg(this.createPageMessage(newPage.comicList)));
            }
        }
        return true;
    }

    createPageMessage(comicList) {
        const message = [];
        comicList.forEach((comic, index) => {
            message.push({ 
                message: `${index + 1}. 标题：${comic.title}\n页数：${comic.pages}\n上传时间：${comic.posted}\n原始地址：${comic.link}` 
            });
        });
        message.push({ 
            message: `查看当前页指定内容:\n"exloli推送1"\n切换页:\n"exloli第一页"，"exloli上一页"，"exloli下一页"，"exloli最后一页"` 
        });
        return message;
    }
}