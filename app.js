document.addEventListener("DOMContentLoaded", function() {
    const applyForm = document.getElementById('applyForm');
    const submitBtn = document.getElementById('submitBtn');
    const countBlock = document.getElementById('applicantCountBlock');
    const countNumber = document.getElementById('countNumber');

    /* ======= Fetch Applicant Count ======= */
    // Link mặc định do Admin cấu hình sẵn để ứng viên nào cũng thấy được
    const DEFAULT_SHEET_LINK = "https://docs.google.com/spreadsheets/d/1VZMl-gOTHAIBgH03vMJGYTYUtPPaOIzcfsgZ-euuiLA/edit?resourcekey=&gid=1783727686#gid=1783727686";
    const savedSheetLink = localStorage.getItem('agari_sheet_link') || DEFAULT_SHEET_LINK;
    
    if (savedSheetLink) {
        fetchSheetCount(savedSheetLink);
    }

    function fetchSheetCount(url) {
        // Trích xuất Sheet ID từ URL
        const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match && match[1]) {
            const sheetId = match[1];
            // Dùng Google Visualization API để đếm số dòng ở cột A (Cột Timestamp)
            // Thêm Date.now() để chống cache, đảm bảo số liệu cập nhật lập tức
            const query = encodeURIComponent("SELECT count(A)");
            const queryUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&tq=${query}&gid=1783727686&_nocache=${Date.now()}`;
            
            fetch(queryUrl)
                .then(res => res.text())
                .then(text => {
                    // API trả về json bọc trong text, cần cắt chuỗi
                    const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
                    const data = JSON.parse(jsonStr);
                    if (data && data.table && data.table.rows.length > 0) {
                        const totalRows = data.table.rows[0].c[0].v;
                        // Trừ 1 dòng tiêu đề
                        const count = totalRows > 0 ? totalRows - 1 : 0;
                        if (count >= 0) {
                            countNumber.innerText = count;
                        }
                    }
                })
                .catch(err => {
                    console.log("Cannot fetch count (có thể do sheet chưa bật chế độ public): ", err);
                    countNumber.innerText = "N/A";
                });
        }
    }

    // Tự động làm mới số lượng mỗi 15 giây (chống người dùng treo tab)
    setInterval(() => {
        const currentLink = localStorage.getItem('agari_sheet_link') || DEFAULT_SHEET_LINK;
        if (currentLink && !document.hidden) {
            fetchSheetCount(currentLink);
        }
    }, 15000);

    // Hàm parse ngày sinh DD/MM/YYYY để tính tuổi
    function calculateAge(dobString) {
        const parts = dobString.split('/');
        if (parts.length !== 3) return 0;
        const dob = new Date(parts[2], parts[1] - 1, parts[0]);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        return age;
    }

    // Hàm kiểm tra trùng lặp thông qua Google Sheet Visualization API
    async function checkDuplicate(phone, cccd) {
        try {
            const currentLink = localStorage.getItem('agari_sheet_link') || DEFAULT_SHEET_LINK;
            const match = currentLink.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (!match) return false;
            const sheetId = match[1];
            
            // Tìm trong Cột F (CCCD) hoặc Cột I (Số ĐT) - Giả định dựa vào cấu trúc hiện tại
            const query = encodeURIComponent(`SELECT F, I WHERE F='${cccd}' OR I='${phone}'`);
            const queryUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&tq=${query}&gid=1783727686&_nocache=${Date.now()}`;
            
            const res = await fetch(queryUrl);
            const text = await res.text();
            const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
            const data = JSON.parse(jsonStr);
            
            if (data && data.table && data.table.rows && data.table.rows.length > 0) {
                return true; // Có trùng lặp
            }
            return false;
        } catch(err) {
            console.error("Lỗi khi check trùng lặp:", err);
            return false; // Nếu lỗi, cứ cho qua để không block user
        }
    }

    // Biến lưu trạng thái trúng tuyển
    let isAccepted = false;

    // Xử lý Validation và Submit
    submitBtn.addEventListener('click', async function(e) {
        e.preventDefault(); // Luôn chặn mặc định để xử lý riêng
        
        // Form Validation (HTML5 Pattern & Required)
        if (!applyForm.checkValidity()) {
            applyForm.reportValidity();
            return;
        }

        const inputs = applyForm.querySelectorAll('input[required], select[required]');
        let isValid = true;
        let firstInvalid = null;

        for (let el of inputs) {
            if (el.type === 'radio') {
                const checked = applyForm.querySelector(`input[name="${el.name}"]:checked`);
                if (!checked) {
                    isValid = false;
                    firstInvalid = el;
                    break;
                }
            } else if (!el.value.trim()) {
                isValid = false;
                firstInvalid = el;
                break;
            }
        }

        // Validate ngày sinh theo regex
        const dobInput = document.getElementById('dob');
        const dobRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[012])\/\d{4}$/;
        if (dobInput && !dobRegex.test(dobInput.value.trim())) {
            alert("⚠️ Ngày sinh chưa đúng định dạng. Vui lòng nhập DD/MM/YYYY (VD: 01/01/2000).");
            dobInput.focus();
            return;
        }

        if (!isValid) {
            alert("⚠️ Vui lòng điền và chọn ĐẦY ĐỦ tất cả các thông tin bắt buộc (có dấu *) trước khi gửi!");
            if (firstInvalid) {
                firstInvalid.focus();
                firstInvalid.closest('.form-group').scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }

        // --- Đổi UI nút sang trạng thái đang tải ---
        const originalBtnHTML = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> <span>ĐANG KIỂM TRA...</span>';
        submitBtn.style.opacity = '0.8';
        submitBtn.style.pointerEvents = 'none'; // Chặn click nhiều lần

        // Lấy SĐT và CCCD để check trùng
        const phone = document.getElementById('phone').value.trim();
        const cccd = document.getElementById('cccd').value.trim();

        const isDuplicate = await checkDuplicate(phone, cccd);
        
        if (isDuplicate) {
            alert("❌ Số Điện Thoại hoặc Số CCCD này đã được đăng ký trước đó. Bạn không thể nộp thêm!");
            submitBtn.innerHTML = originalBtnHTML;
            submitBtn.style.opacity = '1';
            submitBtn.style.pointerEvents = 'auto';
            return; // Dừng lại, không submit
        }

        // --- Kiểm tra điều kiện trúng tuyển ---
        // Tuổi: 18 - 35
        const age = calculateAge(dobInput.value.trim());
        const isAgeValid = (age >= 18 && age <= 35);
        
        // VNID Mức 2 = CÓ
        const vnidOption = applyForm.querySelector('input[name="entry.1059679510"]:checked');
        const hasVnid = vnidOption && vnidOption.value === "CÓ";

        // Đang tham gia BHXH bên khác = KHÔNG
        const bhxhOption = applyForm.querySelector('input[name="entry.374361314"]:checked');
        const noBhxh = bhxhOption && bhxhOption.value === "KHÔNG";

        // Đang lãnh BHTN = KHÔNG
        const bhtnOption = applyForm.querySelector('input[name="entry.988164786"]:checked');
        const noBhtn = bhtnOption && bhtnOption.value === "KHÔNG";

        if (isAgeValid && hasVnid && noBhxh && noBhtn) {
            isAccepted = true;
        } else {
            isAccepted = false;
        }

        // Gửi form đi
        submitBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> <span>ĐANG GỬI...</span>';
        applyForm.submit();
    });

    applyForm.addEventListener('submit', function(e) {
        // Đã chặn mặc định ở click event để check duplicate, listener này chỉ dự phòng.
    });

    // Check for success via URL params
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('success') === 'true') {
        applyForm.style.display = 'none';
        document.querySelector('.form-subtitle').style.display = 'none';
        
        // Hide QR button if present
        const btnScanQR = document.getElementById('btnScanQR');
        if (btnScanQR) btnScanQR.style.display = 'none';

        // Check isAccepted via localStorage (vì đã reload trang)
        const wasAccepted = localStorage.getItem('agari_last_accepted');
        if (wasAccepted === 'true') {
            document.getElementById('successMessageAccepted').style.display = 'flex';
        } else {
            document.getElementById('successMessage').style.display = 'flex';
        }
        
        // Clear flag after showing
        localStorage.removeItem('agari_last_accepted');
    }

    // Chặn iframe load event để set localStorage trước khi reload
    const iframe = document.getElementById('hidden_iframe');
    if (iframe) {
        iframe.addEventListener('load', function() {
            // Iframe load có thể xảy ra khi trang mới mở, nên chỉ xử lý khi đang submit
            if (submitBtn.innerHTML.includes('ĐANG GỬI')) {
                localStorage.setItem('agari_last_accepted', isAccepted ? 'true' : 'false');
                window.location = '?success=true';
            }
        });
    }

    // Clean URL without reloading page
    if (window.history.replaceState && window.location.search.includes('success=true')) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    /* ======= Custom QR Code Scanner Logic ======= */
    const btnScanQR = document.getElementById('btnScanQR');
    const btnCloseQR = document.getElementById('btnCloseQR');
    const qrModal = document.getElementById('qrModal');
    const qrInputFile = document.getElementById('qrInputFile');
    const qrCaptureFile = document.getElementById('qrCaptureFile');
    
    let html5QrCode = null;

    if (btnScanQR) {
        btnScanQR.addEventListener('click', () => {
            qrModal.classList.add('show');
            
            // Initialize Core Scanner
            html5QrCode = new Html5Qrcode("reader");
            
            // Bắt đầu mở camera
            html5QrCode.start(
                { facingMode: "environment" }, 
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 }
                },
                onScanSuccess,
                onScanFailure
            ).catch(err => {
                console.error("Camera start failed", err);
                // Lỗi mở camera thì bỏ qua, người dùng vẫn có thể dùng nút tải file
            });
        });
    }

    const qrControls = document.getElementById('qrControls');
    const qrConfirmUI = document.getElementById('qrConfirmUI');
    const btnConfirmScan = document.getElementById('btnConfirmScan');
    const btnCancelScan = document.getElementById('btnCancelScan');

    let pendingImageFile = null;
    let pendingEventTarget = null;

    // Hàm xử lý khi người dùng chọn/chụp file
    function handleImageFile(e) {
        if (e.target.files.length == 0 || !html5QrCode) {
            return;
        }
        pendingImageFile = e.target.files[0];
        pendingEventTarget = e.target;

        // Ẩn bảng điều khiển và camera, hiện UI xác nhận
        if (qrControls) qrControls.style.display = 'none';
        if (qrConfirmUI) qrConfirmUI.style.display = 'flex';
        const readerDiv = document.getElementById('reader');
        if (readerDiv) readerDiv.style.display = 'none';
    }

    // Xử lý nút Hủy bỏ ảnh
    if (btnCancelScan) {
        btnCancelScan.addEventListener('click', () => {
            resetConfirmUI();
            if (pendingEventTarget) pendingEventTarget.value = '';
            pendingImageFile = null;
            pendingEventTarget = null;
        });
    }

    // Xử lý nút Xác nhận
    if (btnConfirmScan) {
        btnConfirmScan.addEventListener('click', () => {
            if (!pendingImageFile) return;

            const processFile = () => {
                const readerDiv = document.getElementById('reader');
                if (readerDiv) {
                    readerDiv.style.display = 'block';
                    readerDiv.innerHTML = '<div style="color:white; padding: 20px; text-align: center;"><i class="ri-loader-4-line ri-spin" style="font-size: 24px;"></i><br/>Đang tìm mã QR...</div>';
                }
                if (qrConfirmUI) qrConfirmUI.style.display = 'none';

                html5QrCode.scanFile(pendingImageFile, false)
                    .then(decodedText => {
                        onScanSuccess(decodedText);
                        if (pendingEventTarget) pendingEventTarget.value = '';
                        resetConfirmUI();
                    })
                    .catch(err => {
                        console.log("Không tìm thấy QR, chuyển sang OCR... ", err);
                        
                        if (readerDiv) {
                            readerDiv.innerHTML = '<div style="color:white; padding: 20px; text-align: center;"><i class="ri-focus-3-line ri-spin" style="font-size: 24px;"></i><br/>Đang đọc chữ trên thẻ (AI OCR)...<br/>Vui lòng chờ 5-10 giây...</div>';
                        }

                        // Fallback sang OCR bằng Tesseract.js
                        if (typeof Tesseract !== 'undefined') {
                            Tesseract.recognize(
                                pendingImageFile,
                                'vie',
                                { logger: m => console.log(m) }
                            ).then(({ data: { text } }) => {
                                console.log("OCR Text Extracted:\n", text);
                                
                                let hasData = false;
                                
                                // 1. Tìm CCCD (12 số)
                                const cccdMatch = text.match(/\b\d{12}\b/);
                                if (cccdMatch) {
                                    const cccdInput = document.getElementById('cccd');
                                    if(cccdInput) { cccdInput.value = cccdMatch[0]; hasData = true; }
                                }
                                
                                // 2. Tìm Ngày sinh (DD/MM/YYYY)
                                const dobMatch = text.match(/\b(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[012])\/\d{4}\b/);
                                if (dobMatch) {
                                    const dobInput = document.getElementById('dob');
                                    if(dobInput) { dobInput.value = dobMatch[0]; hasData = true; }
                                }
                                
                                // 3. Tìm Tên (Dựa vào chữ "Họ và tên")
                                const lines = text.split('\n');
                                for (let i = 0; i < lines.length; i++) {
                                    if (lines[i].toLowerCase().includes('họ và tên') || lines[i].toLowerCase().includes('full name')) {
                                        let possibleName = lines[i].replace(/(Họ và tên|Full name|:|;|\|)/gi, '').trim();
                                        // Nếu dòng hiện tại rỗng (chỉ có title), thử dòng tiếp theo
                                        if (!possibleName && i + 1 < lines.length) {
                                            possibleName = lines[i+1].trim();
                                        }
                                        if (possibleName) {
                                            const nameInput = document.getElementById('fullName');
                                            // Dọn dẹp ký tự đặc biệt, lấy In Hoa
                                            if (nameInput) {
                                                nameInput.value = possibleName.replace(/[^a-zA-ZÀ-Ỹà-ỹ\s]/ig, '').trim().toUpperCase();
                                                hasData = true;
                                            }
                                            break;
                                        }
                                    }
                                }

                                // 4. Tìm Giới tính
                                for (let i = 0; i < lines.length; i++) {
                                    const lowerLine = lines[i].toLowerCase();
                                    if (lowerLine.includes('giới tính') || lowerLine.includes('sex') || lowerLine.includes('nam') || lowerLine.includes('nữ')) {
                                        const genderInput = document.getElementById('gender');
                                        if (genderInput) {
                                            if (lowerLine.includes('nam')) {
                                                genderInput.value = 'Nam';
                                                hasData = true;
                                            } else if (lowerLine.includes('nữ') || lowerLine.includes('nu')) {
                                                genderInput.value = 'Nữ';
                                                hasData = true;
                                            }
                                        }
                                    }
                                }

                                // 5. Tìm Địa chỉ (Nơi thường trú)
                                let addressLines = [];
                                let captureAddress = false;
                                for (let i = 0; i < lines.length; i++) {
                                    const lowerLine = lines[i].toLowerCase();
                                    
                                    // Dấu hiệu kết thúc phần địa chỉ
                                    if (captureAddress && (lowerLine.includes('có giá trị') || lowerLine.includes('expiry') || lowerLine.includes('nơi cấp') || lowerLine.includes('giám đốc') || lowerLine.includes('cục trưởng'))) {
                                        captureAddress = false;
                                        break;
                                    }

                                    if (captureAddress && lines[i].trim().length > 3) {
                                        addressLines.push(lines[i].trim());
                                    }

                                    // Bắt đầu chụp địa chỉ khi gặp "thường trú"
                                    if (!captureAddress && (lowerLine.includes('thường trú') || lowerLine.includes('residence'))) {
                                        captureAddress = true;
                                        // Bóc tách text trên cùng dòng (nếu có)
                                        let sameLine = lines[i].replace(/.*(thường trú|residence)[\s:;\|]*/i, '').trim();
                                        if (sameLine.length > 3) {
                                            addressLines.push(sameLine);
                                        }
                                    }
                                }
                                
                                if (addressLines.length > 0) {
                                    const addressInput = document.getElementById('address');
                                    if (addressInput) {
                                        // Lọc bớt ký tự rác
                                        let finalAddress = addressLines.join(', ').replace(/[^a-zA-Z0-9À-Ỹà-ỹ\s\,\-\/\.]/ig, '').replace(/\s+/g, ' ').trim();
                                        // Xóa dấu phẩy thừa ở đầu nếu có
                                        finalAddress = finalAddress.replace(/^[\,\s]+/, '');
                                        addressInput.value = finalAddress;
                                        hasData = true;
                                    }
                                }

                                // 6. Đổ toàn bộ text thô ra giao diện cho user tự copy
                                const rawOcrContainer = document.getElementById('rawOcrContainer');
                                const rawOcrText = document.getElementById('rawOcrText');
                                if (rawOcrContainer && rawOcrText) {
                                    rawOcrText.value = text.trim();
                                    rawOcrContainer.style.display = 'block';
                                }

                                if (hasData) {
                                    alert("Đã đọc được chữ trên thẻ! Vui lòng KIỂM TRA LẠI và ĐIỀN NỐT các thông tin còn thiếu.");
                                } else {
                                    alert("Ảnh quá mờ, không thể đọc được thông tin. Vui lòng tự điền bằng tay!");
                                }
                                
                                closeScanner();
                                if (pendingEventTarget) pendingEventTarget.value = '';
                            }).catch(ocrErr => {
                                console.error("OCR Error:", ocrErr);
                                alert("Đã có lỗi xảy ra khi đọc chữ. Vui lòng nhập bằng tay!");
                                closeScanner();
                                if (pendingEventTarget) pendingEventTarget.value = '';
                            });
                        } else {
                            alert("Không thể đọc được mã QR và thư viện nhận diện chữ chưa tải xong. Vui lòng nhập bằng tay!");
                            closeScanner();
                            if (pendingEventTarget) pendingEventTarget.value = '';
                        }
                    });
            };

            try {
                if (html5QrCode.getState() === Html5QrcodeScannerState.SCANNING) {
                    html5QrCode.stop().then(processFile).catch(processFile);
                } else {
                    processFile();
                }
            } catch (error) {
                try {
                    html5QrCode.stop().then(processFile).catch(processFile);
                } catch (e) {
                    processFile();
                }
            }
        });
    }

    function resetConfirmUI() {
        if (qrControls) qrControls.style.display = 'flex';
        if (qrConfirmUI) qrConfirmUI.style.display = 'none';
        const readerDiv = document.getElementById('reader');
        if (readerDiv) readerDiv.style.display = 'block';
    }

    // Xử lý quét qua ảnh tải lên hoặc chụp từ camera
    if (qrInputFile) {
        qrInputFile.addEventListener('change', handleImageFile);
    }
    if (qrCaptureFile) {
        qrCaptureFile.addEventListener('change', handleImageFile);
    }

    if (btnCloseQR) {
        btnCloseQR.addEventListener('click', closeScanner);
    }

    function closeScanner() {
        qrModal.classList.remove('show');
        resetConfirmUI();
        if (html5QrCode) {
            try {
                html5QrCode.stop().then(() => {
                    html5QrCode.clear();
                }).catch(error => {
                    console.error("Failed to stop html5Qrcode. ", error);
                });
            } catch (e) {
                html5QrCode.clear();
            }
        }
    }

    function onScanSuccess(decodedText) {
        // Stop scanning
        closeScanner();
        
        // Parse CCCD data
        const parts = decodedText.split('|');
        if (parts.length >= 6) {
            const cccdNo = parts[0];
            const fullName = parts[2];
            const dobRaw = parts[3]; // DDMMYYYY
            const gender = parts[4];
            const address = parts[5];

            // Auto fill
            document.getElementById('cccd').value = cccdNo;
            document.getElementById('fullName').value = fullName;
            document.getElementById('address').value = address;
            
            // Select Giới tính
            const genderSelect = document.getElementById('gender');
            for(let i = 0; i < genderSelect.options.length; i++) {
                if (genderSelect.options[i].value === gender || genderSelect.options[i].value.toLowerCase() === gender.toLowerCase()) {
                    genderSelect.selectedIndex = i;
                    break;
                }
            }

            // Format dob DDMMYYYY -> DD/MM/YYYY
            if (dobRaw && dobRaw.length === 8) {
                const day = dobRaw.substring(0, 2);
                const month = dobRaw.substring(2, 4);
                const year = dobRaw.substring(4, 8);
                document.getElementById('dob').value = `${day}/${month}/${year}`;
            }

            // Highlight filled inputs for UX
            ['cccd', 'fullName', 'address', 'gender', 'dob'].forEach(id => {
                const el = document.getElementById(id);
                if(el) {
                    el.style.borderColor = '#10b981';
                    el.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.2)';
                    setTimeout(() => {
                        el.style.borderColor = '';
                        el.style.boxShadow = '';
                    }, 2000);
                }
            });

            alert('Đã quét và điền thông tin thành công!');
        } else {
            alert('Mã QR không hợp lệ. Vui lòng thử lại với CCCD gắn chip.');
        }
    }

    function onScanFailure(error) {
        // Do nothing, keep trying
    }

    /* ======= Admin Function ======= */
    const btnAdmin = document.getElementById('btnAdmin');
    const adminModal = document.getElementById('adminModal');
    const btnCloseAdmin = document.getElementById('btnCloseAdmin');
    const sheetLinkInput = document.getElementById('sheetLinkInput');
    const btnSaveSheet = document.getElementById('btnSaveSheet');
    const btnTestSheet = document.getElementById('btnTestSheet');
    const btnDeleteSheet = document.getElementById('btnDeleteSheet');
    const adminStatusText = document.getElementById('adminStatusText');

    const ADMIN_PASSWORD = "Admin@agari123"; // Đổi mật khẩu tại đây

    if (btnAdmin) {
        btnAdmin.addEventListener('click', () => {
            const pwd = prompt("Nhập mật khẩu để truy cập Quản trị:");
            if (pwd === ADMIN_PASSWORD) {
                adminModal.classList.add('show');
                sheetLinkInput.value = localStorage.getItem('agari_sheet_link') || "";
                adminStatusText.innerText = "";
            } else if (pwd !== null) {
                alert("Mật khẩu không chính xác!");
            }
        });
    }

    if (btnCloseAdmin) {
        btnCloseAdmin.addEventListener('click', () => {
            adminModal.classList.remove('show');
        });
    }

    if (btnSaveSheet) {
        btnSaveSheet.addEventListener('click', () => {
            const link = sheetLinkInput.value.trim();
            if (link) {
                localStorage.setItem('agari_sheet_link', link);
                adminStatusText.innerText = "Đã lưu cấu hình thành công!";
                adminStatusText.className = "admin-status status-success";
                // Tự động load lại đếm số lượng
                fetchSheetCount(link);
            } else {
                adminStatusText.innerText = "Vui lòng nhập link!";
                adminStatusText.className = "admin-status status-error";
            }
        });
    }

    if (btnTestSheet) {
        btnTestSheet.addEventListener('click', () => {
            const link = sheetLinkInput.value.trim();
            if (link) {
                window.open(link, '_blank');
            } else {
                adminStatusText.innerText = "Chưa có link nào được lưu!";
                adminStatusText.className = "admin-status status-error";
            }
        });
    }

    if (btnDeleteSheet) {
        btnDeleteSheet.addEventListener('click', () => {
            localStorage.removeItem('agari_sheet_link');
            sheetLinkInput.value = "";
            adminStatusText.innerText = "Đã xóa cấu hình.";
            adminStatusText.className = "admin-status status-success";
            countBlock.style.display = 'none';
        });
    }
});

// A global flag for the hidden iframe onload event
let submitted = false;
const applyFormGlobal = document.getElementById('applyForm');
if (applyFormGlobal) {
    applyFormGlobal.addEventListener('submit', () => {
        submitted = true;
    });
}
