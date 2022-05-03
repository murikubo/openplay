# docker 환경변수 setting시 code 변경법
constants.js 파일 생성
```
const checkEnv = (envVar) => {
    if(process.env[envVar]) {
        return process.env[envVar];
    }

    console.log(`The ${envVar} variable has not been set.`);
    process.exit(1);
}

const <var1> = checkEnv('<DOCKER_SETTING_ENV_1>'); 
const <var2> = checkEnv('<DOCKER_SETTING_ENV_2>');
const <var3> = checkEnv('<DOCKER_SETTING_ENV_3>'); 
const <var4> = checkEnv('<DOCKER_SETTING_ENV_4>');
const <var5> = checkEnv('<DOCKER_SETTING_ENV_5>');
const <var6> = checkEnv('<DOCKER_SETTING_ENV_6>');
//var : 변수 이름
//DOCKER_SETTING_ENV : docker 환경변수
module.exports = {
    <var1>,
    <var2>,
    <var3>,
    <var4>,
    <var5>,
    <var6>,
}
```
다음과 같은 형식으로 변수 지정 및 export
이후 사용할 파일 내에서
```
const { <var1>, <var2>, <var5> } = require("./constants");
```
형식으로 값 받아와 사용.