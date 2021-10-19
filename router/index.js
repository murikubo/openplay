const fetch = require('node-fetch');
const request = require("request");
const axios = require('axios');
const config = require('../config/config.json');
const fs = require('fs');
const schedule = require('node-schedule');
const mysql = require('mysql2/promise');
const { finished } = require('stream');
const e = require('express');
const postHeader = {
    headers: {
        Authorization: `Bearer ${config.Mattermost_Bot_Personal_Token}`
    },
}
let postData;

const makeAction = (name, path, content) => {
    if (content === undefined) content = null;
    return {
        name: name,
        integration: {
            url: `${config.Server_URL}/${path}`,
            context: content
        }
    };
}

const pool = mysql.createPool({
    host: `${config.DB_Host}`,
    port: `${config.DB_Port}`,
    user: `${config.DB_User}`,
    password: `${config.DB_Password}`,
    database: `${config.DB_Database}`
});

const getAdmins = async () => {
    const systemAdmins = [];
    try {
        const response = await axios.get(
            `${config.Mattermost_Server_URL}/api/v4/users?in_channel=${config.Channel_ID}`,
            {
                headers: {
                    Authorization: `Bearer ${config.Mattermost_Bot_Personal_Token}`
                }
            }
        );
        response.data.forEach(x => {
            if (x.roles.includes('system_admin')) {
                systemAdmins.push(x.username)
            }
        })
        return systemAdmins;
    } catch (error) {
        console.log(error);
    }
}

let actions = [
    makeAction("예", 'redraw'),
    makeAction("취소", "cancel")
];

module.exports = (app) => {
    app.post('/openplay', async (req, res) => {
        const admins = await getAdmins();
        let reqOption = req.body.text;
        const checkAdminUser = await req.body.user_name;
        let regex = /\d+/gm;
        let queryVal = Number(reqOption.match(regex));
        switch (reqOption) {
            case "":
                await nextPlayer();
                break;

            case "status":
                const list = await openplayInfo();
                if (list == null) {
                    res.send({
                        text: "선택된 User가 없습니다! 관리자에 문의하여 `/openplay start` 명령어를 사용해서 봇을 기동해주세요.",
                        response_type: "ephemeral",
                        username: "openplay"
                    });
                    break;
                }
                let pause = (list.pause == '0') ? '아님' : '일시정지됨';
                let finished = (list.finishedUser.length == 0) ? '없음' : list.finishedUser;
                res.send({
                    text: `현재 회차 : **${list.round}**회차 ${list.count}번째\n이번 회차 주자 : **${list.nowUser}**\n남은 User : ${list.leftUser}\n완료 User : ${finished}\n일시정지 : ${pause}`,
                    response_type: "ephemeral",
                    username: "openplay"
                });
                break;

            case "start":
                const beforeStartYesOrNoCheck = await openplayInfo();
                if (beforeStartYesOrNoCheck != null) {
                    res.send({
                        text: "이미 Openplay Bot이 가동되어있습니다. `/openplay`를 선택하여 다음 User를 선택해주세요.",
                        response_type: "ephemeral",
                        username: "openplay"
                    });
                    break;
                }
                if (admins.indexOf(checkAdminUser) >= 0) {
                    startBot();
                    res.send({
                        text: `시작 설정이 완료되었습니다!`,
                        response_type: "ephemeral",
                        username: "openplay"
                    });
                    break;
                }
                res.send({
                    text: `System Admin만 해당 명령어를 사용 가능합니다.`,
                    response_type: "ephemeral",
                    username: "openplay"
                });
                break;

            case "reset":
                const beforeResetYesOrNoCheck = await openplayInfo();
                if (beforeResetYesOrNoCheck == null) {
                    res.send({
                        text: "선택된 User가 없습니다! 관리자에 문의하여 `/openplay start` 명령어를 사용해서 봇을 기동해주세요.",
                        response_type: "ephemeral",
                        username: "openplay"
                    });
                    break;
                }
                if (admins.indexOf(checkAdminUser) >= 0) {
                    actions = [
                        makeAction("리셋", 'reset'),
                        makeAction("취소", 'cancel'),
                    ];
                    attachments = [{
                        "title": "주의!!",
                        "text": `정말로 모든 openplay 정보를 제거하시겠습니까?`,
                        "fields": [],
                        "actions": actions
                    }];
                    res.send({ username: "openplay", response_type: 'in_channel', attachments });
                    break;
                }
                res.send({
                    text: `System Admin만 해당 명령어를 사용 가능합니다.`,
                    response_type: "ephemeral",
                    username: "openplay"
                });
                break;

            case "version":
                res.send({
                    text: `openplay-Bot Version ${config.VERSION}`,
                    response_type: "ephemeral",
                    username: "openplay"
                });
                break;

            case "pause":
                const beforePauseYesOrNoCheck = await openplayInfo();
                if (beforePauseYesOrNoCheck == null) {
                    res.send({
                        text: "선택된 User가 없습니다! 관리자에 문의하여 `/openplay start` 명령어를 사용해서 봇을 기동해주세요.",
                        response_type: "ephemeral",
                        username: "openplay"
                    });
                    break;
                }
                const nowStatus = await pauseopenplay();
                res.send({
                    text: `${nowStatus}`,
                    response_type: "ephemeral",
                    username: "openplay"
                });
                break;

            case `round ${queryVal}`:
                const beforeRoundYesOrNoCheck = await openplayInfo();
                if (beforeRoundYesOrNoCheck == null) {
                    res.send({
                        text: "선택된 User가 없습니다! 관리자에 문의하여 `/openplay start` 명령어를 사용해서 봇을 기동해주세요.",
                        response_type: "ephemeral",
                        username: "openplay"
                    });
                    break;
                }
                if (admins.indexOf(checkAdminUser) >= 0) {
                    const roundCountStatus = await setRoundCount(queryVal);
                    res.send({
                        text: `${roundCountStatus}`,
                        response_type: "ephemeral",
                        username: "openplay"
                    });
                    break;
                }
                res.send({
                    text: "System Admin만 회차 변경할 수 있습니다!",
                    response_type: "ephemeral",
                    username: "openplay"
                });
                break;
            default:
                res.send({
                    text: `명령어가 잘못 입력되었습니다. 명령어를 다시 확인해주세요.`,
                    response_type: "ephemeral",
                    username: "openplay"
                });
                break;
        }
        res.send();
    });

    app.post('/start_play', async (req, res) => {
        let userList = [];
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`SELECT id FROM userInfo;`);
                for (let i = 0; i < results.length; i++) {
                    userList.push(results[i].id);
                }
                userList.splice(userList.indexOf(req.body.context.selected_option), 1);
                try {
                    let [updates] = await connection.query(`INSERT openplay SET round = '1', count = '1', nowUser = '${req.body.context.selected_option}', leftUser = '${userList}', finishedUser = '';`);
                    connection.destroy();
                    res.send({
                        update: {
                            message: `주자 설정이 완료되었습니다. 1회차 1번째 주자는 **@${req.body.context.selected_option}님** 입니다!`,
                            props: {
                                attachments: []
                            }
                        }
                    });
                } catch (error) {
                    connection.destroy();
                    console.log(`1 : ${error}`);
                }
            } catch (error) {
                connection.destroy();
                console.log(`1 : ${error}`);
            }
        } catch (error) {
            console.log(`2 : ${error}`);
        }
    });

    app.post('/next_player', async (req, res) => {
        let fullUserList = [];
        let finisheduser;
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`SELECT userInfo.id, openplay.round, openplay.count, openplay.nowUser, openplay.leftUser, openplay.finishedUser, openplay.pause FROM userInfo, openplay;`);
                for (let i = 0; i < results.length; i++) {
                    fullUserList.push(results[i].id);
                }
                let leftUser = results[0].leftUser.split(',');
                if (leftUser == '') {
                    if (fullUserList.includes(results[0].nowUser)) {
                        fullUserList.splice(fullUserList.indexOf(results[0].nowUser), 1);
                        fullUserList.splice(fullUserList.indexOf(req.body.context.selected_option), 1);
                        finisheduser = '';
                        fullUserList.push(results[0].nowUser);
                    } else {
                        fullUserList.splice(fullUserList.indexOf(req.body.context.selected_option), 1);
                        finisheduser = '';
                        fullUserList.push(results[0].nowUser);
                    }
                    try {
                        let [updates] = await connection.query(`UPDATE openplay SET round = '${Number(results[0].round) + 1}' , count = '1', nowUser = '${req.body.context.selected_option}', leftUser = '${fullUserList}', finishedUser = '${finisheduser}';`);
                        /* postData = {
                            channel_id: `${config.Channel_ID}`,
                            message: `openplay ${Number(results[0].round) + 1}회차 1번째 주자는 **@${req.body.context.selected_option}**님 입니다!`
                        };
                        axios.post(config.Finger_Chat_API_URL, postData, postHeader
                        ).catch(error => {
                            console.log(error);
                        }); */
                        res.send({
                            update: {
                                message: `다음 주자 설정이 완료되었습니다. ${Number(results[0].round) + 1}회차 1번째 주자는 **@${req.body.context.selected_option}님** 입니다!`,
                                props: {
                                    attachments: []
                                }
                            }
                        });
                        connection.destroy();
                    } catch (error) {
                        connection.destroy();
                        console.log(error);
                    }
                    //return `openplay ${round}회차 이번 주 발표자는 **${showUser}**님 입니다!`   
                } else {
                    leftUser.splice(leftUser.indexOf(req.body.context.selected_option), 1);
                    if (results[0].finishedUser.length > 1) {
                        finisheduser = `${results[0].finishedUser},${results[0].nowUser}`;
                    } else {
                        finisheduser = results[0].nowUser;
                    }
                    try {
                        let [updates] = await connection.query(`UPDATE openplay SET count = ${Number(results[0].count) + 1}, nowUser = '${req.body.context.selected_option}', leftUser = '${leftUser}', finishedUser = '${finisheduser}';`);
                        /* postData = {
                            channel_id: `${config.Channel_ID}`,
                            message: `openplay ${results[0].round}회차 ${Number(results[0].count) + 1}번째 주자는 **@${req.body.context.selected_option}**님 입니다!`
                        };
                        axios.post(config.Finger_Chat_API_URL, postData, postHeader
                        ).catch(error => {
                            console.log(error);
                        }); */
                        res.send({
                            update: {
                                message: `다음 주자 설정이 완료되었습니다. ${results[0].round}회차 ${Number(results[0].count) + 1}번째 주자는 **@${req.body.context.selected_option}님** 입니다!`,
                                props: {
                                    attachments: []
                                }
                            }
                        });
                        connection.destroy();
                    } catch (error) {
                        connection.destroy();
                        console.log(error);
                    }
                    //return `openplay ${round}회차 이번 주 발표자는 **${showUser}**님 입니다!`   
                }
            } catch (error) {
                connection.destroy();
                console.log(`1 : ${error}`);
            }
        } catch (error) {
            console.log(`2 : ${error}`);
        }
    });

    app.post('/cancel', (req, res) => {
        const attachments = [{
            "title": "취소하였습니다."
        }];
        res.send({ update: { props: { attachments } } });
    });

    app.post('/reset', (req, res) => {
        resetopenplay();
        const attachments = [{
            "title": "모든 정보를 제거했습니다. `/openplay start`명령어를 사용하여 재시작하실 수 있습니다."
        }];
        res.send({ update: { props: { attachments } } });
    });


    const resetopenplay = async () => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`DELETE FROM openplay WHERE indexcheck = '1';`);
                connection.destroy();
            } catch (error) {
                connection.destroy();
                console.log(`1 : ${error}`);
            }
        } catch (error) {
            console.log(`2 : ${error}`);
        }
    }

    const setRoundCount = async (round) => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [yesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM openplay WHERE indexcheck = '1') AS SUCCESS;`);
                if (yesNo[0].SUCCESS == '0') {
                    connection.destroy();
                    return `현재 진행중이 아닙니다!`
                } else {
                    try {
                        let [results] = await connection.query(`SELECT round FROM openplay;`);
                        try {
                            let [status] = await connection.query(`UPDATE openplay SET round = '${round}';`);
                            connection.destroy();
                            return `회차가 **${results[0].round}회차**에서 **${round}회차**로 변경되었습니다!`;
                        } catch (error) {
                            connection.destroy();
                        }
                    } catch (error) {
                        connection.destroy();
                        return `에러 : ${error}`;
                    }
                }
            } catch (error) {
                return `에러 : ${error}`;
            }
        } catch (error) {
            return `에러 : ${error}`;
        }
    }

    const openplayInfo = async () => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`SELECT * FROM openplay;`);
                connection.destroy();
                return results[0];
            } catch (error) {
                connection.destroy();
                console.log(`1 : ${error}`);
            }
        } catch (error) {
            console.log(`2 : ${error}`);
        }
    }

    const pauseopenplay = async () => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [yesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM openplay WHERE indexcheck = '1') AS SUCCESS;`);
                if (yesNo[0].SUCCESS == '0') {
                    connection.destroy();
                    return `현재 진행중이 아닙니다!`
                } else {
                    try {
                        let [results] = await connection.query(`SELECT pause FROM openplay;`);
                        if (results[0].pause == '0') {
                            try {
                                let [status] = await connection.query(`UPDATE openplay SET pause = '1';`);
                                connection.destroy();
                                postData = {
                                    channel_id: `${config.Channel_ID}`,
                                    message: `진행 Status가 변경되었습니다.\n 현재 상태 : 일시정지됨`
                                };
                                axios.post(config.Finger_Chat_API_URL, postData, postHeader
                                ).catch(error => {
                                    console.log(error);
                                });
                                return `진행 Status가 변경되었습니다.\n 현재 상태 : 일시정지됨`;
                            } catch (error) {
                                connection.destroy();
                            }
                        } else {
                            try {
                                let [status] = await connection.query(`UPDATE openplay SET pause = '0';`);
                                connection.destroy();
                                postData = {
                                    channel_id: `${config.Channel_ID}`,
                                    message: `진행 Status가 변경되었습니다.\n 현재 상태 : 진행중`
                                };
                                axios.post(config.Finger_Chat_API_URL, postData, postHeader
                                ).catch(error => {
                                    console.log(error);
                                });
                                return `진행 Status가 변경되었습니다.\n 현재 상태 : 진행중`;
                            } catch (error) {
                                connection.destroy();
                            }
                        }
                    } catch (error) {
                        connection.destroy();
                        return `에러 : ${error}`;
                    }
                }
            } catch (error) {
                return `에러 : ${error}`;
            }
        } catch (error) {
            return `에러 : ${error}`;
        }
    }

    const nextPlayer = async () => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [yesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM openplay WHERE indexcheck = '1') AS SUCCESS;`);
                if (yesNo[0].SUCCESS == '0') {
                    postData = {
                        channel_id: `${config.Channel_ID}`,
                        message: '현재 Openplay가 시작되어있지 않습니다. `/openplay start`를 통하여 시작해주세요.'
                    };
                    axios.post(config.Finger_Chat_API_URL, postData, postHeader
                    ).catch(error => {
                        console.log(error);
                    });
                } else {
                    let userList = [];
                    let userListInBox = [];
                    try {
                        let [results] = await connection.query(`SELECT leftUser FROM openplay;`);
                        if (!results[0].leftUser) {
                            try {
                                let [results] = await connection.query(`SELECT id FROM userInfo;`);
                                connection.destroy();
                                for (let i = 0; i < results.length; i++) {
                                    userList.push({ "text": results[i].id, "value": results[i].id });
                                }
                                attachments = [{
                                    text: "다음 주자를 선택해주세요.",
                                    fields: [],
                                    actions: [
                                        {
                                            name: "다음 주자를 선택해주세요.",
                                            integration: {
                                                url: `${config.Server_URL}/next_player`,
                                                context: {
                                                }
                                            },
                                            type: 'select',
                                            options: userList
                                        }
                                    ]
                                }];
                                postData = {
                                    channel_id: `${config.Channel_ID}`,
                                    props: { attachments }
                                };
                                axios.post(config.Finger_Chat_API_URL, postData, postHeader
                                ).catch(error => {
                                    console.log(error);
                                });
                            } catch (error) {
                                connection.destroy();
                                console.log(`1 : ${error}`);
                            }
                        } else {
                            userList = results[0].leftUser.split(',');
                            connection.destroy();
                            for (let i = 0; i < userList.length; i++) {
                                userListInBox.push({ "text": userList[i], "value": userList[i] });
                            }
                            attachments = [{
                                text: "다음 주자를 선택해주세요.",
                                fields: [],
                                actions: [
                                    {
                                        name: "다음 주자를 선택해주세요.",
                                        integration: {
                                            url: `${config.Server_URL}/next_player`,
                                            context: {
                                            }
                                        },
                                        type: 'select',
                                        options: userListInBox
                                    }
                                ]
                            }];
                            postData = {
                                channel_id: `${config.Channel_ID}`,
                                props: { attachments }
                            };
                            axios.post(config.Finger_Chat_API_URL, postData, postHeader
                            ).catch(error => {
                                console.log(error);
                            });
                        }
                    } catch (error) {
                        connection.destroy();
                        console.log(`1 : ${error}`);
                    }
                }
            } catch (error) {
                connection.destroy();
                console.log(`1 : ${error}`);
            }
        } catch (error) {
            connection.destroy();
            console.log(`2 : ${error}`);
        }
    }

    const startBot = async () => {
        let userList = [];
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`SELECT id FROM userInfo;`);
                connection.destroy();
                for (let i = 0; i < results.length; i++) {
                    userList.push({ "text": results[i].id, "value": results[i].id });
                }
                attachments = [{
                    text: "시작 주자를 선택해주세요.",
                    fields: [],
                    actions: [
                        {
                            name: "시작 주자를 선택해주세요.",
                            integration: {
                                url: `${config.Server_URL}/start_play`,
                                context: {
                                }
                            },
                            type: 'select',
                            options: userList
                        }
                    ]
                }];
            } catch (error) {
                connection.destroy();
                console.log(`1 : ${error}`);
            }
        } catch (error) {
            console.log(`2 : ${error}`);
        }
        postData = {
            channel_id: `${config.Channel_ID}`,
            props: { attachments }
        };
        axios.post(config.Finger_Chat_API_URL, postData, postHeader
        ).catch(error => {
            console.log(error);
        });
    }

    const reminder = async () => {
        schedule.scheduleJob({ hour: 17, minute: 00, dayOfWeek: [1, 2, 3, 4, 5] }, async () => {
            try {
                let connection = await pool.getConnection(async conn => conn);
                try {
                    let [results] = await connection.query(`SELECT pause, round, count, nowUser FROM openplay;`);
                    connection.destroy();
                    if (results[0].pause == '0') {
                        postData = {
                            channel_id: `${config.Channel_ID}`,
                            message: `${results[0].round}회차 ${results[0].count}번째 주자는 **@${results[0].nowUser}님** 입니다!`
                        };

                        axios.post(config.Finger_Chat_API_URL, postData, postHeader
                        ).catch(error => {
                            console.log(error);
                        });
                    }
                } catch (error) {
                    connection.destroy();
                    console.log(`1 : ${error}`);
                }
            } catch (error) {
                console.log(`2 : ${error}`);
            }
        })
    }
    reminder()
};
