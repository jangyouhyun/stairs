var express = require('express');
var router = express.Router();
var db = require('../db.js');
const { OpenAI } = require('openai');
var bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Initialize OpenAI client
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY // Your OpenAI API key from .env
});

// Fine-tuned model ID
const fineTunedModelId = 'ft:gpt-4o-mini-2024-07-18:personal:summary:A8lnw3tq';

// Function to summarize content using OpenAI
async function getModelResponse(user_input) {
    console.log("Sending user input to OpenAI for summarization: ", user_input); // 디버깅 출력: 사용자 입력 확인

    try {
        const response = await client.chat.completions.create({
            model: fineTunedModelId,
            messages: [
                { role : 'system', content : "당신은 한국인이 입력한 글을 요약해주는 도우미입니다. 기본 컨텐츠와 질의 응답 형식으로 구성된 텍스트에 대해서, 정제된 텍스트로 제공하세요"},
                { role: 'user', content: user_input + '을 요약해주세요'}
            ]
        });
        console.log("Received response from OpenAI: ", response); // 디버깅 출력: OpenAI 응답 확인
        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error("Error with OpenAI request: ", error);
        throw error;
    }
}

/**
 * @swagger
 * tags:
 *   name: Chatbot
 *   description: Chatbot summary 생성 API
 */

/**
 * @swagger
 * /chatbot/summary:
 *   post:
 *     summary: 초기 입력시 챗봇 대화 내용을 요약하여 데이터베이스에 저장
 *     tags: [Chatbot]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bookId:
 *                 type: string
 *                 description: 책 ID
 *               inputCount:
 *                 type: integer
 *                 description: 입력 횟수
 *     responses:
 *       200:
 *         description: 요약 내용이 성공적으로 데이터베이스에 저장됨
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 content:
 *                   type: string
 *                   description: 요약된 내용
 *       500:
 *         description: 서버 오류 또는 OpenAI 요청 오류
 */
// The API endpoint to handle chatbot summary
router.post('/chatbot/summary', function (request, response) {
    console.log('55라우터 진입 시 세션 상태:', request.session);
    var user_id = request.session.nickname;
    var book_id = request.body.bookId;
    var input_count = request.body.inputCount; 

    console.log("Starting chatbot summary for book_id: ", book_id, " and input_count: ", input_count); // 디버깅 출력: 시작 메시지

    db.getConnection(function (err, connection) {
        if (err) throw err;
        connection.beginTransaction(async function (err) {
            if (err) {
                connection.release();
                throw err;
            }

            connection.query(
                'SELECT question, response, quest_num FROM chatbot_data WHERE book_id = ? AND user_id = ? AND input_count = ? ORDER BY quest_num',
                [book_id, user_id, input_count],
                async function (error, results) {
                    if (error) {
                        return connection.rollback(function () {
                            connection.release();
                            throw error;
                        });
                    }

                    console.log("Fetched questions and responses from database: ", results); // 디버깅 출력: DB 결과 확인

                    let combinedContent = results.map(item => {
                        let defineUser = "User: ";
                        
                        // questnum이 1일 때 defineUser를 빈 문자열로 설정
                        if (item.questnum == 1) {
                            defineUser = "";
                        }
                    
                        // 각 item에 대해 question과 response를 반환
                        return `${defineUser}${item.question}, Assistant: ${item.response}`;
                    });
                    

                    try {
                        // Send to OpenAI for summarization
                        let summary = await getModelResponse(combinedContent);

                        console.log("Summary generated by OpenAI: ", summary); // 디버깅 출력: OpenAI가 생성한 요약 확인

                        // Insert summary into chatbot_summary table
                        connection.query(
                            'INSERT INTO chatbot_summary (user_id, book_id, input_count, content) VALUES (?, ?, ?, ?)',
                            [user_id, book_id, input_count, summary],
                            function (error, insertResult) {
                                if (error) {
                                    return connection.rollback(function () {
                                        connection.release();
                                        throw error;
                                    });
                                }

                                console.log("Summary successfully saved to the database."); // 디버깅 출력: 요약이 데이터베이스에 저장됨

                                connection.commit(function (err) {
                                    if (err) {
                                        return connection.rollback(function () {
                                            connection.release();
                                            throw err;
                                        });
                                    }

                                    connection.release();

                                    // 요약된 summary와 함께 성공 응답 반환
                                    response.status(200).json({
                                        status: 200,
                                        message: 'Summary successfully saved!',
                                        content: summary// 요약된 내용도 클라이언트로 반환
                                    });
                                });
                            }
                        );
                    } catch (openAIError) {
                        console.error("OpenAI summarization error: ", openAIError); // 디버깅 출력: OpenAI 에러 확인
                        return connection.rollback(function () {
                            connection.release();
                            response.status(500).json({ status: 500, message: 'Error with OpenAI summarization' });
                        });
                    }
                }
            );
        });
    });
});

/**
 * @swagger
 * /chatbot/summary2:
 *   post:
 *     summary: 추가 입력시 챗봇 대화 내용을 요약하여 최신 input_count와 함께 데이터베이스에 저장
 *     tags: [Chatbot]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bookId:
 *                 type: string
 *                 description: 책 ID
 *     responses:
 *       200:
 *         description: 요약 내용이 성공적으로 데이터베이스에 저장됨
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 content:
 *                   type: string
 *                   description: 요약된 내용
 *       500:
 *         description: 서버 오류 또는 OpenAI 요청 오류
 */
// The API endpoint to handle chatbot summary
router.post('/chatbot/summary2', function (request, response) {
    console.log('라우터 진입 시 세션 상태:', request.session);
    var user_id = request.session.nickname;
    var book_id = request.body.bookId;

    console.log("Starting chatbot summary for book_id: ", book_id); // 디버깅 출력: 시작 메시지

    db.getConnection(function (err, connection) {
        if (err) throw err;
        connection.beginTransaction(async function (err) {
            if (err) {
                connection.release();
                throw err;
            }

            // Get max input_count from init_input table for given book_id
            connection.query(
                'SELECT MAX(input_count) AS max_input_count FROM init_input WHERE book_id = ?',
                [book_id],
                async function (error, result) {
                    if (error) {
                        return connection.rollback(function () {
                            connection.release();
                            throw error;
                        });
                    }

                    const input_count = result[0].max_input_count;
                    console.log("Max input_count retrieved from init_input table: ", input_count); // 디버깅 출력: 최대 input_count 확인

                    // Fetch chatbot_data based on book_id, user_id, and input_count
                    connection.query(
                        'SELECT question, response, quest_num FROM chatbot_data WHERE book_id = ? AND user_id = ? AND input_count = ? ORDER BY quest_num',
                        [book_id, user_id, input_count],
                        async function (error, results) {
                            if (error) {
                                return connection.rollback(function () {
                                    connection.release();
                                    throw error;
                                });
                            }

                            console.log("Fetched questions and responses from database: ", results); // 디버깅 출력: DB 결과 확인

                            let combinedContent = results.map(item => {
                                let defineUser = "User: ";
                                
                                // questnum이 1일 때 defineUser를 빈 문자열로 설정
                                if (item.quest_num == 1) {
                                    defineUser = "";
                                }
                            
                                // 각 item에 대해 question과 response를 반환
                                return `${defineUser}${item.question}, Assistant: ${item.response}`;
                            }).join(" ");

                            try {
                                // Send to OpenAI for summarization
                                let summary = await getModelResponse(combinedContent);

                                console.log("Summary generated by OpenAI: ", summary); // 디버깅 출력: OpenAI가 생성한 요약 확인

                                // Insert summary into chatbot_summary table
                                connection.query(
                                    'INSERT INTO chatbot_summary (user_id, book_id, input_count, content) VALUES (?, ?, ?, ?)',
                                    [user_id, book_id, input_count, summary],
                                    function (error, insertResult) {
                                        if (error) {
                                            return connection.rollback(function () {
                                                connection.release();
                                                throw error;
                                            });
                                        }

                                        console.log("Summary successfully saved to the database."); // 디버깅 출력: 요약이 데이터베이스에 저장됨

                                        connection.commit(function (err) {
                                            if (err) {
                                                return connection.rollback(function () {
                                                    connection.release();
                                                    throw err;
                                                });
                                            }

                                            connection.release();

                                            // 요약된 summary와 함께 성공 응답 반환
                                            response.status(200).json({
                                                status: 200,
                                                message: 'Summary successfully saved!',
                                                content: summary // 요약된 내용도 클라이언트로 반환
                                            });
                                        });
                                    }
                                );
                            } catch (openAIError) {
                                console.error("OpenAI summarization error: ", openAIError); // 디버깅 출력: OpenAI 에러 확인
                                return connection.rollback(function () {
                                    connection.release();
                                    response.status(500).json({ status: 500, message: 'Error with OpenAI summarization' });
                                });
                            }
                        }
                    );
                }
            );
        });
    });
});


module.exports = router;
