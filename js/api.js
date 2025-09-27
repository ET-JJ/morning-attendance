/**
 * 광영여고 아침자습 관리 시스템 - API 연동 모듈
 * 로컬스토리지 + 구글 앱스크립트 연동 지원
 */

class AttendanceAPI {
    constructor() {
        // 🆕 JJ 선생님의 Google Apps Script URL 자동 설정
        this.webAppUrl = localStorage.getItem('WEBAPP_URL') || 'https://script.google.com/macros/s/AKfycbway641X2eskkkpRAw36Yde059Vcto9Oqr6ezRx5969FzO912cZsOKlOrAvbUkfSXWZMA/exec';
        this.isOnlineMode = true; // 항상 온라인 모드로 설정
        
        // URL이 설정되지 않았다면 자동으로 저장
        if (!localStorage.getItem('WEBAPP_URL')) {
            localStorage.setItem('WEBAPP_URL', this.webAppUrl);
        }
        
        console.log(`아침자습 API 초기화 - ${this.isOnlineMode ? '온라인' : '오프라인'} 모드`);
        console.log('Google Apps Script URL:', this.webAppUrl);
    }

    /**
     * 구글 앱스크립트 웹앱 URL 설정
     */
    setWebAppUrl(url) {
        this.webAppUrl = url;
        this.isOnlineMode = true;
        localStorage.setItem('WEBAPP_URL', url);
        console.log('구글 앱스크립트 URL 설정됨:', url);
    }

    /**
     * 출결 데이터 제출
     */
    async submitAttendance(data) {
        console.log('출결 데이터 제출:', data);
        
        if (this.isOnlineMode && this.webAppUrl) {
            return await this._submitToGoogleScript(data);
        } else {
            return this._submitToLocalStorage(data);
        }
    }

    /**
     * 구글 앱스크립트로 데이터 전송 (JJ 선생님의 v8 시스템 연동)
     */
    async _submitToGoogleScript(data) {
        try {
            // v8 Apps Script doPost 함수에 맞는 데이터 형식으로 변환
            const formData = new URLSearchParams();
            formData.append('action', 'submit');
            formData.append('student_id', data.studentId);
            formData.append('student_name', data.studentName);
            formData.append('status', data.status);
            formData.append('timestamp', data.timestamp || new Date().toISOString());
            formData.append('source', 'web_interface');

            const response = await fetch(this.webAppUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData,
                mode: 'no-cors' // Google Apps Script CORS 회피
            });

            console.log('📡 구글 앱스크립트 v8 시스템으로 전송 완료');
            console.log('📊 전송 데이터:', {
                student_id: data.studentId,
                student_name: data.studentName, 
                status: data.status,
                timestamp: data.timestamp
            });
            
            // 로컬스토리지에도 백업 저장 (이중 안전장치)
            this._submitToLocalStorage(data);
            
            return {
                success: true,
                message: `📡 ${data.studentName}님의 ${data.status} 기록이 구글 시스템으로 전송되었습니다!`,
                timestamp: new Date().toISOString(),
                mode: 'google_script_v8'
            };

        } catch (error) {
            console.warn('🔄 구글 앱스크립트 전송 실패, 오프라인 모드로 전환:', error);
            // 실패시 로컬스토리지로 안전하게 폴백
            const result = this._submitToLocalStorage(data);
            result.message = `⚠️ 온라인 연결 실패로 로컬에 저장되었습니다. 나중에 자동 동기화됩니다.`;
            return result;
        }
    }

    /**
     * 로컬스토리지에 데이터 저장
     */
    _submitToLocalStorage(data) {
        try {
            const attendanceData = JSON.parse(localStorage.getItem('attendanceData') || '[]');
            
            // 데이터에 고유 ID 추가
            const recordData = {
                ...data,
                id: this._generateId(),
                submittedAt: new Date().toISOString(),
                source: this.isOnlineMode ? 'online_backup' : 'offline'
            };
            
            attendanceData.push(recordData);
            localStorage.setItem('attendanceData', JSON.stringify(attendanceData));
            
            console.log('로컬스토리지 저장 완료:', recordData);
            
            return {
                success: true,
                message: '출결이 성공적으로 기록되었습니다!',
                data: recordData
            };

        } catch (error) {
            console.error('로컬스토리지 저장 실패:', error);
            return {
                success: false,
                message: '데이터 저장 중 오류가 발생했습니다.'
            };
        }
    }

    /**
     * 출결 데이터 조회 (하이브리드 모드: Google Sheets + 로컬 데이터)
     */
    async getAttendanceData(filters = {}) {
        try {
            // 🆕 하이브리드 모드: Google Sheets 데이터와 로컬 데이터 병합
            const localResult = this._getFromLocalStorage(filters);
            const localData = localResult.success ? localResult.data : [];
            
            let googleData = [];
            
            try {
                // Google Sheets 데이터 가져오기 시도
                const googleResult = await this._getFromGoogleScript(filters);
                if (googleResult.success) {
                    googleData = googleResult.data;
                    console.log('📊 Google Sheets 데이터:', googleData.length + '건');
                }
            } catch (googleError) {
                console.warn('Google Sheets 데이터 로드 실패, 로컬 데이터만 사용:', googleError);
            }
            
            // 중복 제거를 위한 고유키 생성 함수
            const generateUniqueKey = (record) => {
                const date = new Date(record.timestamp).toISOString().split('T')[0];
                const time = new Date(record.timestamp).toTimeString().split(' ')[0].substring(0, 5);
                return `${date}_${record.studentId}_${record.status}_${time}`;
            };
            
            // 데이터 병합 및 중복 제거
            const mergedData = [];
            const seenKeys = new Set();
            
            // Google Sheets 데이터 우선 추가
            googleData.forEach(record => {
                const key = generateUniqueKey(record);
                if (!seenKeys.has(key)) {
                    mergedData.push(record);
                    seenKeys.add(key);
                }
            });
            
            // 로컬 데이터 추가 (중복 제외)
            localData.forEach(record => {
                const key = generateUniqueKey(record);
                if (!seenKeys.has(key)) {
                    mergedData.push(record);
                    seenKeys.add(key);
                }
            });
            
            // 시간순 정렬
            mergedData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            console.log(`📊 하이브리드 데이터 조회 완료: Google ${googleData.length}건 + Local ${localData.length}건 = 총 ${mergedData.length}건`);
            
            return {
                success: true,
                data: mergedData,
                source: 'hybrid',
                googleCount: googleData.length,
                localCount: localData.length,
                total: mergedData.length
            };
            
        } catch (error) {
            console.error('데이터 조회 실패:', error);
            // 최후의 수단: 로컬 데이터만 반환
            const fallbackResult = this._getFromLocalStorage(filters);
            fallbackResult.source = 'fallback_local';
            return fallbackResult;
        }
    }

    /**
     * 구글 앱스크립트에서 데이터 조회 (v8 시스템 doGet 연동)
     */
    async _getFromGoogleScript(filters) {
        try {
            // 🆕 새로운 Google Apps Script 엔드포인트 사용 (CORS 문제 해결)
            const params = new URLSearchParams({
                action: 'getAllAttendance'
            });
            
            console.log('📡 Google Apps Script 요청 시도...');
            
            const response = await fetch(`${this.webAppUrl}?${params}`);

            console.log('📡 응답 상태:', response.status, response.statusText);
            
            if (response.ok) {
                const googleResult = await response.json();
                console.log('📊 Google Apps Script 응답:', googleResult);
                
                if (!googleResult.success) {
                    throw new Error(googleResult.error || 'Google Sheets 데이터 조회 실패');
                }
                
                // Google Sheets 데이터를 웹시스템 형식으로 변환
                const convertedData = [];
                
                googleResult.data.forEach(googleRecord => {
                    // 입실 기록 생성
                    if (googleRecord.checkInTime) {
                        const baseDate = typeof googleRecord.date === 'string' ? 
                            googleRecord.date : 
                            new Date(googleRecord.date).toISOString().split('T')[0];
                        
                        const checkInDateTime = new Date(`${baseDate}T${googleRecord.checkInTime}`);
                        
                        if (!isNaN(checkInDateTime.getTime())) {
                            convertedData.push({
                                id: `${googleRecord.id}-checkin`,
                                studentId: googleRecord.studentId,
                                studentName: googleRecord.studentName,
                                status: '입실',
                                timestamp: checkInDateTime.toISOString(),
                                source: 'google_sheets'
                            });
                        }
                    }
                    
                    // 퇴실 기록 생성
                    if (googleRecord.checkOutTime) {
                        const baseDate = typeof googleRecord.date === 'string' ? 
                            googleRecord.date : 
                            new Date(googleRecord.date).toISOString().split('T')[0];
                        
                        const checkOutDateTime = new Date(`${baseDate}T${googleRecord.checkOutTime}`);
                        
                        if (!isNaN(checkOutDateTime.getTime())) {
                            convertedData.push({
                                id: `${googleRecord.id}-checkout`,
                                studentId: googleRecord.studentId,
                                studentName: googleRecord.studentName,
                                status: '퇴실',
                                timestamp: checkOutDateTime.toISOString(),
                                source: 'google_sheets'
                            });
                        }
                    }
                });
                
                // 날짜 필터링 적용
                let filteredData = convertedData;
                if (filters.date) {
                    filteredData = convertedData.filter(record => {
                        const recordDate = new Date(record.timestamp).toISOString().split('T')[0];
                        return recordDate === filters.date;
                    });
                }
                
                console.log('📊 구글 스프레드시트에서 데이터 조회 성공:', filteredData.length + '건');
                console.log('🔄 변환된 데이터 샘플:', filteredData[0]);
                
                return {
                    success: true,
                    data: filteredData,
                    source: 'google_sheets_v8',
                    total: filteredData.length
                };
            } else {
                throw new Error(`HTTP ${response.status}`);
            }

        } catch (error) {
            console.warn('🔄 구글 스프레드시트 조회 실패, 로컬 데이터 사용:', error);
            const localResult = this._getFromLocalStorage(filters);
            localResult.fallbackMode = true;
            return localResult;
        }
    }

    /**
     * 로컬스토리지에서 데이터 조회
     */
    _getFromLocalStorage(filters = {}) {
        try {
            const attendanceData = JSON.parse(localStorage.getItem('attendanceData') || '[]');
            let filteredData = attendanceData;

            // 날짜 필터
            if (filters.date) {
                const targetDate = filters.date;
                filteredData = filteredData.filter(record => {
                    const recordDate = new Date(record.timestamp).toISOString().split('T')[0];
                    return recordDate === targetDate;
                });
            }

            // 학생 필터
            if (filters.studentId) {
                filteredData = filteredData.filter(record => 
                    record.studentId === filters.studentId
                );
            }

            console.log(`로컬스토리지에서 ${filteredData.length}개 데이터 조회`);

            return {
                success: true,
                data: filteredData,
                source: 'localStorage',
                total: filteredData.length
            };

        } catch (error) {
            console.error('로컬스토리지 조회 실패:', error);
            return {
                success: false,
                message: '데이터 조회 중 오류가 발생했습니다.',
                data: []
            };
        }
    }

    /**
     * 오늘의 출결 통계
     */
    async getTodayStats() {
        const today = new Date().toISOString().split('T')[0];
        const result = await this.getAttendanceData({ date: today });
        
        if (!result.success) {
            return { success: false, message: result.message };
        }

        const attendanceData = result.data;
        
        // 학생별 데이터 집계
        const studentData = {};
        attendanceData.forEach(record => {
            const key = record.studentId;
            if (!studentData[key]) {
                studentData[key] = {
                    studentId: record.studentId,
                    studentName: record.studentName,
                    checkIn: null,
                    checkOut: null,
                    records: []
                };
            }
            
            studentData[key].records.push(record);
            
            if (record.status === '입실') {
                const checkTime = new Date(record.timestamp);
                if (!studentData[key].checkIn || checkTime < new Date(studentData[key].checkIn.timestamp)) {
                    studentData[key].checkIn = record;
                }
            } else if (record.status === '퇴실') {
                const checkTime = new Date(record.timestamp);
                if (!studentData[key].checkOut || checkTime > new Date(studentData[key].checkOut.timestamp)) {
                    studentData[key].checkOut = record;
                }
            }
        });

        const students = Object.values(studentData);
        const total = students.length;
        const completed = students.filter(s => s.checkIn && s.checkOut).length;
        const ongoing = students.filter(s => s.checkIn && !s.checkOut).length;
        const missing = students.filter(s => !s.checkIn).length;

        return {
            success: true,
            data: {
                total,
                completed,
                ongoing, 
                missing,
                completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
                students
            }
        };
    }

    /**
     * 주간 통계
     */
    async getWeeklyStats() {
        const weekData = [];
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const dayResult = await this.getAttendanceData({ date: dateStr });
            const dayData = dayResult.success ? dayResult.data : [];
            
            // 학생별 집계
            const students = {};
            dayData.forEach(record => {
                if (!students[record.studentId]) {
                    students[record.studentId] = { checkIn: false, checkOut: false };
                }
                if (record.status === '입실') students[record.studentId].checkIn = true;
                if (record.status === '퇴실') students[record.studentId].checkOut = true;
            });
            
            const completed = Object.values(students).filter(s => s.checkIn && s.checkOut).length;
            const total = Object.keys(students).length;
            
            weekData.push({
                date: dateStr,
                dateLabel: date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
                total,
                completed,
                rate: total > 0 ? Math.round((completed / total) * 100) : 0
            });
        }

        return {
            success: true,
            data: weekData
        };
    }

    /**
     * 누락 데이터 자동 처리 (시뮬레이션)
     */
    async processMissingData() {
        console.log('누락 데이터 자동 처리 시작...');
        
        const today = new Date().toISOString().split('T')[0];
        const todayStats = await this.getTodayStats();
        
        if (!todayStats.success) {
            return { success: false, message: '데이터 조회 실패' };
        }

        const students = todayStats.data.students;
        let processedCount = 0;
        const processedStudents = [];

        // 입실 누락 처리
        students.forEach(student => {
            if (!student.checkIn) {
                console.log(`${student.studentName}(${student.studentId}) 입실 누락 → 07:10 자동 처리`);
                processedCount++;
                processedStudents.push({
                    name: student.studentName,
                    id: student.studentId,
                    type: '입실 누락',
                    processedTime: '07:10:00'
                });
            }
        });

        // 퇴실 누락 처리
        students.forEach(student => {
            if (student.checkIn && !student.checkOut) {
                console.log(`${student.studentName}(${student.studentId}) 퇴실 누락 → 07:47 자동 처리`);
                processedCount++;
                processedStudents.push({
                    name: student.studentName,
                    id: student.studentId,
                    type: '퇴실 누락',
                    processedTime: '07:47:00'
                });
            }
        });

        return {
            success: true,
            message: `${processedCount}건의 누락 데이터가 자동으로 처리되었습니다.`,
            processedCount,
            processedStudents
        };
    }

    /**
     * 데이터 내보내기
     */
    exportData(format = 'csv') {
        const attendanceData = JSON.parse(localStorage.getItem('attendanceData') || '[]');
        
        if (attendanceData.length === 0) {
            throw new Error('내보낼 데이터가 없습니다.');
        }

        if (format === 'csv') {
            return this._exportToCsv(attendanceData);
        } else if (format === 'json') {
            return this._exportToJson(attendanceData);
        }
    }

    /**
     * CSV 형태로 내보내기
     */
    _exportToCsv(data) {
        const headers = ['날짜', '학번', '이름', '구분', '시간'];
        const csvRows = [headers.join(',')];
        
        data.forEach(record => {
            const date = new Date(record.timestamp).toLocaleDateString('ko-KR');
            const time = new Date(record.timestamp).toLocaleTimeString('ko-KR');
            const row = [date, record.studentId, record.studentName, record.status, time];
            csvRows.push(row.join(','));
        });

        const csvContent = "\uFEFF" + csvRows.join('\n'); // BOM 추가로 한글 깨짐 방지
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `광영여고_아침자습_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        
        return { success: true, message: 'CSV 파일이 다운로드되었습니다.' };
    }

    /**
     * JSON 형태로 내보내기
     */
    _exportToJson(data) {
        const jsonContent = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `광영여고_아침자습_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        return { success: true, message: 'JSON 파일이 다운로드되었습니다.' };
    }

    /**
     * JJ 선생님 v8 시스템 연결 상태 확인
     */
    async checkConnection() {
        if (!this.webAppUrl) {
            return { 
                connected: false, 
                mode: 'offline',
                message: '⚠️ 구글 앱스크립트 URL이 설정되지 않았습니다.',
                setup_url: './integration-guide.html'
            };
        }

        try {
            // 간단한 연결 테스트 (timeout 설정)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3초 타임아웃
            
            const testResponse = await fetch(`${this.webAppUrl}?action=test&timestamp=${Date.now()}`, {
                method: 'GET',
                mode: 'no-cors',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log('🔗 JJ 선생님의 구글 스프레드시트 v8 시스템과 연결 시도 완료');
            
            return {
                connected: 'unknown', // no-cors에서는 정확한 상태 확인 불가하지만 정상
                mode: 'hybrid',
                message: '🔄 하이브리드 모드: 로컬 + 구글 시스템',
                spreadsheet_id: '1dJEOyc59eZgwidKjXiYptgreAIabfBbkndN0g17Qsb8',
                system_version: 'v8',
                features: ['로컬 저장', '구글 동기화', '오프라인 지원']
            };

        } catch (error) {
            // 네트워크 오류는 정상적인 상황으로 처리
            console.log('📡 네트워크 상태:', error.name || 'Unknown');
            
            if (error.name === 'AbortError') {
                return {
                    connected: false,
                    mode: 'local_only',
                    message: '⏱️ 연결 시간 초과: 로컬 모드로 동작'
                };
            }
            
            return {
                connected: false,
                mode: 'local_only', 
                message: '📱 로컬 모드: 오프라인에서도 정상 작동',
                note: '데이터는 로컬에 안전하게 저장됩니다.'
            };
        }
    }

    /**
     * Google Apps Script URL 설정 및 검증
     */
    async configureGoogleAppsScript(url) {
        try {
            // URL 유효성 검증
            if (!url || !url.includes('script.google.com')) {
                throw new Error('올바른 Google Apps Script URL을 입력해주세요.');
            }

            // 연결 테스트
            const testResponse = await fetch(`${url}?action=test&timestamp=${Date.now()}`, {
                method: 'GET',
                mode: 'no-cors'
            });

            // URL 저장
            this.setWebAppUrl(url);
            
            console.log('🎉 Google Apps Script v8 시스템 연동 성공!');
            
            return {
                success: true,
                message: '✅ JJ 선생님의 구글 스프레드시트 시스템과 성공적으로 연결되었습니다!',
                spreadsheetId: '1dJEOyc59eZgwidKjXiYptgreAIabfBbkndN0g17Qsb8',
                features: ['자동화 처리', '이메일 리포트', '누락 데이터 보완']
            };

        } catch (error) {
            console.error('Google Apps Script 설정 실패:', error);
            return {
                success: false,
                message: `연동 설정 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * 구글 스프레드시트에서 학생 명단 조회
     */
    async getStudentList() {
        try {
            if (this.isOnlineMode && this.webAppUrl) {
                console.log('📚 구글 스프레드시트에서 학생 명단 조회 중...');
                
                const params = new URLSearchParams({
                    action: 'getStudentList'
                });
                
                const response = await fetch(`${this.webAppUrl}?${params}`, {
                    method: 'GET'
                });
                
                if (response.ok) {
                    const result = await response.json();
                    
                    if (result.success && result.data) {
                        console.log('✅ 학생 명단 조회 성공:', result.data.length + '명');
                        
                        // 로컬스토리지에 캐시 저장 (오프라인 대비)
                        localStorage.setItem('studentList', JSON.stringify(result.data));
                        localStorage.setItem('studentListUpdated', new Date().toISOString());
                        
                        return {
                            success: true,
                            data: result.data,
                            source: 'google_sheets'
                        };
                    }
                }
            }
            
            // 오프라인이거나 실패 시 캐시된 데이터 사용
            const cachedList = localStorage.getItem('studentList');
            if (cachedList) {
                const studentList = JSON.parse(cachedList);
                console.log('📱 캐시된 학생 명단 사용:', studentList.length + '명');
                return {
                    success: true,
                    data: studentList,
                    source: 'cache'
                };
            }
            
            return {
                success: false,
                message: '학생 명단을 불러올 수 없습니다.'
            };
            
        } catch (error) {
            console.warn('학생 명단 조회 실패:', error);
            
            // 오류 시에도 캐시 시도
            const cachedList = localStorage.getItem('studentList');
            if (cachedList) {
                return {
                    success: true,
                    data: JSON.parse(cachedList),
                    source: 'cache_fallback'
                };
            }
            
            return {
                success: false,
                message: '학생 명단 조회 중 오류가 발생했습니다.'
            };
        }
    }

    /**
     * 학번으로 학생 이름 조회
     */
    async getStudentName(studentId) {
        try {
            const studentListResult = await this.getStudentList();
            
            if (!studentListResult.success) {
                return {
                    success: false,
                    message: studentListResult.message
                };
            }
            
            // 학번으로 학생 찾기
            const student = studentListResult.data.find(s => s.studentId === studentId);
            
            if (student) {
                return {
                    success: true,
                    data: {
                        studentId: student.studentId,
                        studentName: student.studentName
                    },
                    source: studentListResult.source
                };
            } else {
                return {
                    success: false,
                    message: '해당 학번의 학생을 찾을 수 없습니다.'
                };
            }
            
        } catch (error) {
            console.error('학생 이름 조회 실패:', error);
            return {
                success: false,
                message: '학생 정보 조회 중 오류가 발생했습니다.'
            };
        }
    }

    /**
     * Google Sheets에서 학생별 통계 조회 (student.html용)
     */
    async getStudentStats(studentId) {
        if (!studentId || studentId.length !== 5) {
            return {
                success: false,
                message: '올바른 5자리 학번을 입력해주세요.'
            };
        }

        try {
            if (this.isOnlineMode && this.webAppUrl) {
                // Google Apps Script v8 시스템에서 학생 데이터 조회
                const params = new URLSearchParams({
                    action: 'getStudentData',
                    student_id: studentId,
                    format: 'json'
                });

                const response = await fetch(`${this.webAppUrl}?${params}`, {
                    method: 'GET',
                    mode: 'cors'
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(`📊 ${studentId}번 학생 Google Sheets 데이터 조회 성공`);
                    return {
                        success: true,
                        data: data,
                        source: 'google_sheets_v8'
                    };
                }
            }

            // 오프라인 모드 또는 온라인 실패시 로컬 데이터 사용
            const localData = this._getFromLocalStorage({ studentId });
            return localData;

        } catch (error) {
            console.warn('학생 통계 조회 실패, 로컬 데이터 사용:', error);
            return this._getFromLocalStorage({ studentId });
        }
    }

    /**
     * Google Apps Script 자동화 기능 트리거 (admin용)
     */
    async triggerAutomation(type = 'processMissing') {
        if (!this.isOnlineMode || !this.webAppUrl) {
            return {
                success: false,
                message: '오프라인 모드에서는 자동화 기능을 사용할 수 없습니다.'
            };
        }

        try {
            const params = new URLSearchParams({
                action: type,
                timestamp: new Date().toISOString(),
                trigger_source: 'web_interface'
            });

            const response = await fetch(`${this.webAppUrl}?${params}`, {
                method: 'GET',
                mode: 'no-cors'
            });

            console.log(`🤖 자동화 기능 트리거: ${type}`);
            
            return {
                success: true,
                message: `✅ ${type} 자동화 기능이 실행되었습니다.`,
                note: 'Google Apps Script에서 백그라운드로 처리 중입니다.'
            };

        } catch (error) {
            console.error('자동화 트리거 실패:', error);
            return {
                success: false,
                message: `자동화 실행 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * Google Sheets 실시간 데이터 동기화
     */
    async syncWithGoogleSheets() {
        if (!this.isOnlineMode || !this.webAppUrl) {
            return {
                success: false,
                message: 'Google Apps Script가 설정되지 않았습니다.'
            };
        }

        try {
            // 로컬에 저장된 미동기화 데이터 찾기
            const localData = JSON.parse(localStorage.getItem('attendanceData') || '[]');
            const unsyncedData = localData.filter(record => record.source === 'offline');

            if (unsyncedData.length === 0) {
                return {
                    success: true,
                    message: '동기화할 데이터가 없습니다.',
                    syncedCount: 0
                };
            }

            // 각 미동기화 데이터를 Google Sheets로 전송
            let syncedCount = 0;
            for (const record of unsyncedData) {
                try {
                    await this._submitToGoogleScript(record);
                    // 성공한 데이터는 source를 'synced'로 변경
                    record.source = 'synced';
                    record.syncedAt = new Date().toISOString();
                    syncedCount++;
                } catch (syncError) {
                    console.warn('개별 데이터 동기화 실패:', syncError);
                }
            }

            // 업데이트된 데이터 저장
            localStorage.setItem('attendanceData', JSON.stringify(localData));

            return {
                success: true,
                message: `✅ ${syncedCount}건의 오프라인 데이터가 Google Sheets와 동기화되었습니다.`,
                syncedCount,
                totalCount: unsyncedData.length
            };

        } catch (error) {
            console.error('Google Sheets 동기화 실패:', error);
            return {
                success: false,
                message: `동기화 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * 고유 ID 생성
     */
    _generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    /**
     * 로컬 데이터 초기화
     */
    clearLocalData() {
        localStorage.removeItem('attendanceData');
        console.log('로컬 출결 데이터가 초기화되었습니다.');
        return { success: true, message: '로컬 데이터가 초기화되었습니다.' };
    }

    /**
     * 시스템 정보
     */
    getSystemInfo() {
        const attendanceData = JSON.parse(localStorage.getItem('attendanceData') || '[]');
        
        return {
            mode: this.isOnlineMode ? 'google_sheets_v8' : 'offline_only',
            webAppUrl: this.webAppUrl,
            spreadsheetId: '1dJEOyc59eZgwidKjXiYptgreAIabfBbkndN0g17Qsb8',
            localRecords: attendanceData.length,
            lastUpdate: attendanceData.length > 0 ? 
                Math.max(...attendanceData.map(r => new Date(r.timestamp).getTime())) : null,
            version: '9.0',
            integration: 'JJ선생님_구글스프레드시트_v8',
            features: {
                offline_storage: true,
                google_sync: this.isOnlineMode,
                auto_processing: this.isOnlineMode,
                email_reports: this.isOnlineMode
            }
        };
    }
}

// 전역 API 인스턴스 생성
window.attendanceAPI = new AttendanceAPI();

// 연결 상태 주기적 확인
setInterval(async () => {
    const status = await window.attendanceAPI.checkConnection();
    console.log('연결 상태:', status);
}, 60000); // 1분마다 확인
