/**
 * 이미지 생성 요청 큐 시스템 클래스
 */
class ImageRequestQueue {
    constructor(timeout = 150) {
        this.queue = [];
        this.processing = false;
        this.currentRequest = null; // 현재 처리 중인 요청
        this.timeout = timeout; // 타임아웃(초)
    }

    /**
     * 큐에 이미지 생성 요청 추가 (t2i/i2i 공통)
     * @param {object} req - 요청 정보 객체 { message, size, userMessage, isI2I, attachments }
     * @param {Function} processRequest - 실제 요청을 처리하는 함수
     * @returns {Promise<void>}
     */
    async addRequest(req, processRequest) {
        return new Promise((resolve, reject) => {
            const requestObj = {
                ...req,
                cancelled: false,
                timestamp: Date.now(),
                resolve: (val) => {
                    clearTimeout(timeout);
                    resolve(val);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                }
            };
            const timeout = setTimeout(() => {
                requestObj.cancelled = true;
                req.message.reply(`${this.timeout}초 동안 응답이 없어 타임아웃 에러가 발생했습니다.`).catch(() => {});
                reject(new Error('timeout'));
            }, this.timeout * 1000); // ms 단위

            this.queue.push(requestObj);
            this.processNext(processRequest);
        });
    }

    /**
     * 현재 큐 상태를 반환 (관리자용)
     * @returns {Array<{userMessage: string, timestamp: number, cancelled?: boolean}>}
     */
    getQueueStatus() {
        // 취소된 요청들을 큐에서 제거
        this.queue = this.queue.filter(q => !q.cancelled);
        
        // 현재 진행 중인 요청도 포함
        const status = [];
        if (this.currentRequest && !this.currentRequest.cancelled) {
            status.push({
                userMessage: this.currentRequest.userMessage,
                timestamp: this.currentRequest.timestamp,
                inProgress: true
            });
        }
        this.queue.forEach(q => {
            if (!q.cancelled) {
                status.push({
                    userMessage: q.userMessage,
                    timestamp: q.timestamp,
                    inProgress: false
                });
            }
        });
        return status;
    }

    /**
     * 큐에서 다음 요청을 처리 (t2i/i2i 분기)
     * @param {Function} processRequest - 실제 요청을 처리하는 함수
     * @returns {Promise<void>}
     */
    async processNext(processRequest) {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;
        const request = this.queue.shift();
        this.currentRequest = request; // 현재 요청 저장

        let finished = false;
        const safeResolve = (val) => {
            if (!finished) {
                finished = true;
                request.resolve(val);
            }
        };
        const safeReject = (err) => {
            if (!finished) {
                finished = true;
                request.reject(err);
            }
        };

        // 요청이 이미 취소된 경우
        if (request.cancelled) {
            this.currentRequest = null;
            this.processing = false;
            safeResolve();
            // 다음 요청 처리
            setImmediate(() => this.processNext(processRequest));
            return;
        }

        // 요청 정보 디버깅 로그
        console.log('[이미지 생성 요청]', {
            type: request.isI2I ? 'i2i' : 't2i',
            user: request.message.author?.tag || request.message.author?.username,
            channel: request.message.channelId,
            prompt: request.userMessage,
            size: request.size,
            attachments: request.attachments ? request.attachments.length : 0
        });

        try {
            // 실제 요청 처리 함수 호출
            await processRequest(request);
            safeResolve();
        } catch (error) {
            console.error('Queue Processing Error:', error);
            safeReject(error);
        } finally {
            this.currentRequest = null; // 처리 끝나면 비움
            this.processing = false;
            await this.processNext(processRequest);
        }
    }

    /**
     * 큐 초기화
     */
    clear() {
        this.queue = [];
        this.processing = false;
        this.currentRequest = null;
    }

    /**
     * 현재 처리 중인 요청 취소
     */
    cancelCurrent() {
        if (this.currentRequest) {
            this.currentRequest.cancelled = true;
        }
    }

    /**
     * 큐 길이 반환
     * @returns {number}
     */
    getLength() {
        return this.queue.filter(q => !q.cancelled).length;
    }

    /**
     * 큐가 비어있는지 확인
     * @returns {boolean}
     */
    isEmpty() {
        return this.getLength() === 0 && !this.currentRequest;
    }
}

module.exports = ImageRequestQueue; 