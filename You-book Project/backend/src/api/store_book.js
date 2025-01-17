var express = require('express');
var router = express.Router();
var db = require('../db.js');
var moment = require('moment'); // 현재 시간 생성용
require('dotenv').config();

/**
 * @swagger
 * tags:
 *   name: Book
 *   description: 책 데이터를 저장하거나 업데이트하는 API
 */

/**
 * @swagger
 * /store:
 *   post:
 *     summary: 책의 데이터를 `book_list` 및 `real_book` 테이블에 저장하거나 혹은 이미 저장된 책에 대해서 업데이트
 *     tags: [Book]
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
 *               category:
 *                 type: string
 *                 description: 카테고리
 *               title:
 *                 type: string
 *                 description: 책 제목 (기본값: 제목없는 자서전)
 *               image_path:
 *                 type: string
 *                 description: 커버 이미지 경로
 *     responses:
 *       200:
 *         description: 책 데이터가 성공적으로 업데이트됨
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: 성공 메시지
 *       404:
 *         description: 지정된 `final_input` 데이터가 없음
 *       500:
 *         description: 서버 오류 또는 DB 오류
 */
// final_input => book-list / real-book 에 저장하거나 업데이트
router.post('/store', function (req, res) {
    const book_id = req.body.bookId;
    const user_id = req.session.nickname;
    const input_count = req.body.inputCount;
    const category = req.body.category;
    const title = req.body.title ? req.body.title : "제목없는 자서전";
    const image_path = req.body.image_path;

    console.log("또 널임? : ", image_path);
    // final_input에서 해당 book_id, user_id, input_count에 부합하는 데이터 조회
    const finalInputQuery = `
        SELECT big_title, small_title, content, content_order , image_path
        FROM final_input 
        WHERE book_id = ? AND user_id = ? AND input_count = ?
    `;

    db.query(finalInputQuery, [book_id, user_id, input_count], function (error, finalInputResult) {
        if (error) {
            console.error('Error fetching data from final_input:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }

        if (finalInputResult.length === 0) {
            return res.status(404).json({ message: 'No data found in final_input.' });
        }

        const currentDate = moment().format('YYYY-MM-DD'); // 현재 시각 생성

        // book_list에 이미 해당 book_id와 user_id가 존재하는지 확인
        const checkBookListQuery = `
            SELECT * FROM book_list WHERE book_id = ? AND user_id = ?
        `;
        
        db.query(checkBookListQuery, [book_id, user_id], function (error, bookListResult) {
            if (error) {
                console.error('Error checking book_list:', error);
                return res.status(500).json({ message: 'Internal server error' });
            }

            if (bookListResult.length > 0) {
                // book_list에 데이터가 있으면 업데이트
                const updateBookListQuery = `
                    UPDATE book_list 
                    SET create_date = ?, title = ?, category = ?, image_path = ?
                    WHERE book_id = ? AND user_id = ?
                `;

                db.query(updateBookListQuery, [currentDate, title, category, image_path, book_id, user_id], function (error) {
                    if (error) {
                        console.error('Error updating book_list:', error);
                        return res.status(500).json({ message: 'Internal server error' });
                    }
                });
            } else {
                // book_list에 데이터가 없으면 삽입
                const insertBookListQuery = `
                    INSERT INTO book_list (book_id, user_id, create_date, image_path, title, category) 
                    VALUES (?, ?, ?, ?, ?, ?)
                `;

                db.query(insertBookListQuery, [book_id, user_id, currentDate, image_path, title, category], function (error) {
                    if (error) {
                        console.error('Error inserting into book_list:', error);
                        return res.status(500).json({ message: 'Internal server error' });
                    }
                });
            }
        });

        // real_book에 대해 업데이트 또는 삽입 처리
        finalInputResult.forEach(function (row, index) {
            const checkRealBookQuery = `
                SELECT * FROM real_book WHERE book_id = ? AND content_order = ?
            `;
            
            db.query(checkRealBookQuery, [book_id, row.content_order], function (error, realBookResult) {
                if (error) {
                    console.error('Error checking real_book:', error);
                    return res.status(500).json({ message: 'Internal server error' });
                }

                if (realBookResult.length > 0) {
                    // real_book에 데이터가 있으면 업데이트
                    const updateRealBookQuery = `
                        UPDATE real_book 
                        SET big_title = ?, small_title = ?, content = ? , image_path = ?
                        WHERE book_id = ? AND content_order = ?
                    `;

                    db.query(updateRealBookQuery, [row.big_title, row.small_title, row.content, row.image_path, book_id, row.content_order], function (error) {

                        if (error) {
                            console.error('Error updating real_book:', error);
                            return res.status(500).json({ message: 'Internal server error' });
                        }

                        // 모든 데이터가 처리되었을 때만 응답을 보냄
                        if (index === finalInputResult.length - 1) {
                            res.status(200).json({ message: 'Data successfully updated in book_list and real_book.' });
                        }
                    });
                } else {
                    // real_book에 데이터가 없으면 삽입
                    const insertRealBookQuery = `
                        INSERT INTO real_book (book_id, big_title, small_title, image_path, content, content_order) 
                        VALUES (?, ?, ?, ?, ?, ?)
                    `;

                    db.query(insertRealBookQuery, [book_id, row.big_title, row.small_title, row.image_path, row.content, row.content_order], function (error) {
                        if (error) {
                            console.error('Error inserting into real_book:', error);
                            return res.status(500).json({ message: 'Internal server error' });
                        }

                        // 모든 데이터가 처리되었을 때만 응답을 보냄
                        if (index === finalInputResult.length - 1) {
                            res.status(200).json({ message: 'Data successfully stored in book_list and real_book.' });
                        }
                    });
                }
            });
        });
    });
});

module.exports = router;
