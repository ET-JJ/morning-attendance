/**
 * 광영여고 아침자습 관리 시스템 - API 연동 모듈
 * 로컬스토리지 + 구글 앱스크립트 연동 지원
 */

class AttendanceAPI {
    constructor() {
        // 구글 앱스크립트 웹앱 URL (나중에 설정)
        this.webAppUrl = localStorage.getItem('WEBAPP_URL') || null;
        this.isOnlineMode = this.webAppUrl ? true : false;
        
        console.log(`아침자습 API 초기화 - ${this.isOnlineMode ? '온라인' : '오프라인'} 모드`);
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
     * 구글 앱스크립트로 데이터 전송
     */
    async _submitToGoogleScript(data) {
        try {
            const response = await fetch(this.webAppUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
                mode: 'no-cors' // CORS 문제 회피
            });

            // no-cors 모드에서는 응답을 읽을 수 없으므로 성공으로 간주
            console.log('구글 앱스크립트 전송 완료');
            
            // 로컬스토리지에도 백업 저장
            this._submitToLocalStorage(data);
            
            return {
                success: true,
                message: '구글 앱스크립트로 전송 완료',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.warn('구글 앱스크립트 전송 실패, 로컬 저장으로 대체:', error);
            // 실패시 로컬스토리지로 폴백
            return this._submitToLocalStorage(data);
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
     * 출결 데이터 조회
     */
    async getAttendanceData(filters = {}) {
        if (this.isOnlineMode && this.webAppUrl) {
            return await this._getFromGoogleScript(filters);
        } else {
            return this._getFromLocalStorage(filters);
        }
    }

    /**
     * 구글 앱스크립트에서 데이터 조회
     */
    async _getFromGoogleScript(filters) {
        try {
            const params = new URLSearchParams({
                action: 'getTodayAttendance',
                ...filters
            });
            
            const response = await fetch(`${this.webAppUrl}?${params}`, {
                method: 'GET',
                mode: 'cors'
            });

            if (response.ok) {
                const result = await response.json();
                console.log('구글 앱스크립트에서 데이터 조회 성공');
                return result;
            } else {
                throw new Error(`HTTP ${response.status}`);
            }

        } catch (error) {
            console.warn('구글 앱스크립트 조회 실패, 로컬 데이터 사용:', error);
            return this._getFromLocalStorage(filters);
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
     * 연결 상태 확인
     */
    async checkConnection() {
        if (!this.webAppUrl) {
            return { 
                connected: false, 
                mode: 'offline',
                message: '구글 앱스크립트 URL이 설정되지 않았습니다.'
            };
        }

        try {
            const response = await fetch(`${this.webAppUrl}?action=getSystemStatus`, {
                method: 'GET',
                mode: 'no-cors'
            });
            
            return {
                connected: true,
                mode: 'online',
                message: '구글 앱스크립트와 연결되었습니다.'
            };

        } catch (error) {
            return {
                connected: false,
                mode: 'offline', 
                message: '구글 앱스크립트 연결 실패. 오프라인 모드로 동작합니다.'
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
            mode: this.isOnlineMode ? 'online' : 'offline',
            webAppUrl: this.webAppUrl,
            localRecords: attendanceData.length,
            lastUpdate: attendanceData.length > 0 ? 
                Math.max(...attendanceData.map(r => new Date(r.timestamp).getTime())) : null,
            version: '8.0'
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