# Naïve Easy Mock

## Introduction

As [easy-mock](https://github.com/easy-mock/easy-mock) said:

> If you're unable to deploy an Easy Mock service by yourself, the [online service](https://easy-mock.com/) is recommended.

But if you're unable to access the [online service](https://easy-mock.com/) service, the [naïve](https://github.com/easy-mock/easy-mock) version is recommended.

This project is intended to start a local mock server with the zip file download from [easy-mock](https://github.com/easy-mock/easy-mock) and without any complicated deployment.

## Features

- ~~Support API proxying~~
- ~~Convenient shortcuts~~
- ~~Support Collaborative editing~~
- ~~Support team project~~
- Support RESTful
- ~~Support [Swagger](https://swagger.io) | OpenAPI Specification ([1.2](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/1.2.md) & [2.0](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/2.0.md) & [3.0](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md))~~
  - ~~Create project quickly based on Swagger~~
  - ~~Support displaying parameters and the return value~~
  - ~~Support displaying class model~~
- More flexible and extensible in response data
- Support for custom response configuration (example: status/headers/cookies)
- Use [Mock.js](http://mockjs.com/) schema
- ~~Support [restc](https://github.com/ElemeFE/restc) to preview API~~

## Quick Start

> Before starting, we assume that you're already have installed [Node.js](https://nodejs.org).

### Installation

```shell
$ git clone https://github.com/tautcony/naive-easy-mock.git
$ cd naive-easy-mock && npm install
```

### Configuration

Create the **config.json** file by copying **config-sample.json** and edit it to overwrite default configuration.

default configuration in code is shown as below:

```js
const MOCK_RESOURCES_PATH = path.join(__dirname, 'resources');
const MOCK_PORT = 2333;
```

### Launch

```shell
$ npm run mock
```

## License

[GPL-3.0](https://opensource.org/licenses/GPL-3.0)