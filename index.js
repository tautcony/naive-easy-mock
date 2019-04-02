const fs = require("fs");
const path = require("path");
const Mock = require("mockjs");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const request = require("request-promise-native");

let MOCK_RESOURCES_PATH = path.join(__dirname, 'resources');
let MOCK_PORT = 2333;

try {
    const config = require("./config.json");
    if (config.MOCK_RESOURCES_PATH) {
        MOCK_RESOURCES_PATH = config.MOCK_RESOURCES_PATH;
    }
    if (config.MOCK_PORT) {
        MOCK_PORT = config.MOCK_PORT;
    }
} catch (ex) {
    console.log("No config file found, use default configuration.");
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());

const TypeOf = (value) => {
    const result = /\[object ([^\]]+)\]/.exec(Object.prototype.toString.call(value));
    if (result === null) {
        return undefined;
    }
    return result[1];
}

/**
 * 处理普通的键值对或符合 Mock.js 的数据模板
 * @param {String} key 键
 * @param {Any} value 值
 * @param {Any} argv 函数调用参数
 * @param {Object} root 根对象
 */
const handle_mockjs_syntax = (key, value, argv, root) => {
    let [name, rule] = key.split("|");
    if (rule) {
        rule = rule.trim();
    }
    let ret_value = undefined;
    const value_type = TypeOf(value);
    if (value_type === "Function") {
        ret_value = recursive(value, argv, root);
    } else if (value_type === "Object") {
        if (rule) {
            // 构造一个形如`name: ''`的对象确保mockjs不会执行函数规则
            const placeholder_value = {};
            // 若对象中包含数据模板会使得mockjs继续递归执行下去，故只取其name
            const name_key_mapping = {};
            Object.keys(value).forEach(value_key => {
                const value_name = value_key.split("|")[0];
                name_key_mapping[value_name] = value_key;
                placeholder_value[value_name] = "";
            });
            // 构建一个键值对供mockjs处理
            const template = {};
            template[key] = placeholder_value;
            const filtered_value = Mock.mock(template)[name];
            Object.keys(filtered_value).forEach(value_name => {
                // 恢复原本的 key
                const value_key = name_key_mapping[value_name]
                filtered_value[value_key] = value[value_key];
            });
            ret_value = recursive(filtered_value, argv, root);
        } else {
            ret_value = recursive(value, argv, root);
        }
    } else if (value_type === "Array") {
        const palceholder_value = [];
        for (let i = 0; i < value.length; ++i) {
            palceholder_value.push(i);
        }
        const template = {}
        template[key] = palceholder_value;
        const filtered_value = Mock.mock(template)[name];
        // 仅一个元素则直接处理
        if (TypeOf(filtered_value) === "Array") {
            filtered_value.forEach(item => filtered_value[item] = value[item]);
            ret_value = recursive(filtered_value, argv, root);
        } else {
            ret_value = recursive(value[filtered_value], argv, root);
        }
    } else {
        const template = {}
        template[key] = value;
        ret_value = Mock.mock(template)[name];
    }
    return {
        key: name,
        value: ret_value
    };
}

/**
 * 处理 Object 类型的数据
 * @param {Object} val 当前对象
 * @param {Any} argv 函数调用参数
 * @param {Object} root 根对象
 */
const handle_object = (val, argv, root) => {
    // 同一层级中，确保函数型的对象后执行
    const keys = Object.keys(val).map(key => {
        return {
            key,
            type: TypeOf(val[key]) === "Function" ? 1 : 0
        };
    }).sort((lhs, rhs) => {
        if (lhs.type === rhs.type) {
            return lhs.key < rhs.key ? -1 : 1
        }
        return lhs.type - rhs.type
    });
    for (const org_key of keys.map(item => item.key)) {
        const { key, value } = handle_mockjs_syntax(org_key, val[org_key], argv, root);
        val[key] = value;
        if (org_key !== key) {
            delete val[org_key];
        }
    }
    return val;
}

/**
 * 递归处理整个模板文件
 * @param {Object} val 当前对象
 * @param {Any} argv 函数调用参数
 * @param {Object} root 根对象
 */
const recursive = (val, argv, root) => {
    const val_type = TypeOf(val);
    switch (val_type) {
        case "Object": {
            val = handle_object(val, argv, root);
            break;
        }
        case "Array": {
            for (let i = 0; i < val.length; ++i) {
                val[i] = recursive(val[i], argv, root);
            }
            break;
        }
        case "Function": {
            val = val.call(root, argv);
            break;
        }
        default: {
            break;
        }
    }
    return val;
}

/**
 * 生成与 easy-mock 一致的 _req 对象
 * @param {Express.Request} req 
 */
const generate_req = (req, params) => {
    const ret = {};
    ret.url = req.url;
    ret.method = req.method;
    ret.query = req.query;
    ret.body = req.body;
    ret.path = req.path;
    ret.header = req.headers;
    ret.originalUrl = req.originalUrl;
    ret.host = ret.hostname = req.hostname;
    ret.protocol = req.protocol;
    ret.ip = req.ip;

    const query_string = req.originalUrl.substr(req.path.length + 1);
    ret.querystring = query_string;
    ret.search = "?" + query_string;

    let content_type = (req.headers["content-type"] || "").toLowerCase();
    // remove charset
    content_type.split(";").forEach(item => {
        if (!item.includes('charset')) {
            content_type = item.trim();
        }
    });

    ret.type = content_type;

    ret.params = params || {}; // restful
    
    ret.get = filed => req.header[filed];
    ret.cookies = filed => {
        return req.cookies[filed];
    };
    return ret;
}

/**
 * 根据请求路径寻找对应的模板文件并处理 RESTful 参数
 * @param {String} url 请求路径
 */
const build_params = (url) => {
    const params = {};
    const path_seg = url.replace(/\\/g, "/").split("/").filter(seg => seg !== '');
    let current_path = MOCK_RESOURCES_PATH;
    for (let i = 0; i < path_seg.length; ++i) {
        const seg = path_seg[i];
        const is_final = i === path_seg.length - 1;
        if (is_final) {
            const non_restful_end_path = path.join(current_path, `${seg}.json`);
            if (fs.existsSync(non_restful_end_path)) {
                return {
                    success: true,
                    path: non_restful_end_path,
                    params
                };
            }
            const valid_files = fs.readdirSync(current_path, { withFileTypes: true })
            .filter(dirent => dirent.isFile() && (/^_(.+)\.json$/.test(dirent.name) || /^{(.+)}\.json$/.test(dirent.name)))
            .map(dirent => dirent.name);
            if (valid_files.length === 0) {
                return { success: false };
            }
            const name = valid_files[0];
            const param_key = (/^_(.+)\.json$/.exec(name) || /^{(.+)\.json}$/.exec(name))[1];
            params[param_key] = seg;
            const restful_end_path = path.join(current_path, name);
            if (fs.existsSync(restful_end_path)) {
                return {
                    success: true,
                    path: restful_end_path,
                    params
                };
            }
            return { success: false };
        } else {
            const test_path = path.join(current_path, seg);
            if (fs.existsSync(test_path)) {
                current_path = test_path;
            } else {
                const files = fs.readdirSync(current_path, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory() && (/^_(.+)$/.test(dirent.name) || /^{(.+)}$/.test(dirent.name)))
                .map(dirent => dirent.name);
                if (files.length === 0) {
                    console.log("No matched router for url: ", url);
                    return { success: false };
                } else {
                    const name = files[0];
                    const param_key = (/^_(.+)$/.exec(name) || /^{(.+)}$/.exec(name))[1];
                    params[param_key] = seg;
                    current_path = path.join(current_path, name);
                }
            }
        }
    }
    return { success: false };
}

/**
 * 请求处理函数
 * @param {Express.Request} req Request
 * @param {Express.Response} res Response
 */
const mock_handle = async (req, res) => {
    const url = req.originalUrl.split("?")[0];
    try {
        const params_result = build_params(url);
        if (!params_result.success) {
            res.json({
                error: "Not Found"
            });
            return;
        }
        const content = fs.readFileSync(params_result.path, 'utf-8').trim();
        const _req = generate_req(req, params_result.params);
        if (/http/i.test(content)) {
            const response = await request({
                uri: content,
                method: req.method,
                qs: req.query,
                params: req.params
            }).catch(error => {
                res.json({ error: "Not Found" });
            });
            if (response) {
                try {
                    res.json(JSON.parse(response));
                } catch {
                    res.send(response);
                }
            }
        } else {
            const mock_data = eval(`(${content})`);
            const result = recursive(mock_data, { _req, Mock }, mock_data);
            console.log(`Handle '${_req.url}' with:\n`, result);
            res.json(result);
        }
    } catch (ex) {
        console.log(`Failed to handle '${req.url}' with exception:\n`, ex);
        res.json({
            error: ex.toString()
        });
    }
}

app.all(/\/.+/, mock_handle);

app.get('/', (req, res) => res.send("Naïve Easy Mock!"));

app.listen(MOCK_PORT, () => {
    console.log(`Mock Server run at port: ${MOCK_PORT}`);
});
