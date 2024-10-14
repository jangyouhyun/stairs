var express = require('express');
var router = express.Router();
var db = require('../db.js');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // 프로젝트 루트 경로 기준으로 uploads 폴더 설정
        cb(null, path.join(__dirname, '../../../uploads/')); // youbook/uploads/ 경로에 저장
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname); // 파일 확장자 추출
        const filename = `${uuidv4()}${ext}`; // uuid로 고유한 파일명 생성
        cb(null, filename); // 파일명 설정
    }
});


const upload = multer({ storage: storage });


// 문단 내부 이미지 업데이트 API
router.post('/update_image', upload.single('image'), function (req, res) {
    const book_id = req.body.bookId;
    const user_id = req.session.nickname;  // 세션에서 사용자 아이디 가져옴
    const input_count = req.body.inputCount;
    const content_order = req.body.content_order; // 업데이트할 레코드의 content_order
    const data_type = req.body.whatData;

    // 디버깅용 콘솔 로그 추가
    console.log('book_id:', book_id);
    console.log('user_id:', user_id);
    console.log('input_count:', input_count);
    console.log('content_order:', content_order);
    console.log('data_type:', data_type);
    console.log('Uploaded file:', req.file);
    console.log('AI-generated image path:', req.body.image_path);

    let image = null; // 이미지 경로를 저장할 변수

    // 업로드된 파일이 있을 경우
    if (data_type == 1 && req.file) {
        image = `/uploads/${req.file.filename}`; // 업로드된 이미지 경로
        console.log('Image from file:', image);
    } else if (data_type == 2 && req.body.image_path) {
        // AI로 생성된 이미지 경로가 있을 경우
        image = req.body.image_path;
        console.log('Image from AI:', image);
    } else if (!req.file && !req.body.image_path) {
        // 파일이나 경로가 없을 경우 에러 처리
        console.error('파일이나 이미지 경로가 없습니다.');
        return res.status(400).json({ error: '파일이나 이미지 경로가 없습니다.' });
    }

    // 필수 값들이 있는지 확인
    if (!book_id || !user_id || !input_count || !content_order) {
        console.error('필수 정보가 누락되었습니다.');
        return res.status(400).json({ error: '필수 정보가 없습니다.' });
    }

    // 이미지 경로 업데이트 쿼리 (book_list 테이블)
    const updateImageQuery = `
        UPDATE book_list
        SET image_path = ?
        WHERE book_id = ?
    `;
    
    db.query(updateImageQuery, [image, user_id, book_id, input_count, content_order], function (err, results) {
        if (err) {
            console.error('Failed to update image:', err);
            return res.status(500).json({ error: 'Failed to update image' });
        }

        // 업데이트가 성공적으로 이루어졌는지 확인
        if (results.affectedRows === 0) {
            console.warn('No matching record found:', { book_id });
            return res.status(404).json({ error: 'No matching record found' });
        }

        console.log('Image path updated successfully:', image_path);
        // 성공적으로 업데이트한 경우
        console.log('Image updated successfully:', image);
        return res.status(200).json({ success: true, image_path: image });
    });
});

module.exports = router;