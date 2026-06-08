document.addEventListener("DOMContentLoaded", function() {
    const applyForm = document.getElementById('applyForm');
    const submitBtn = document.getElementById('submitBtn');
    const countBlock = document.getElementById('applicantCountBlock');
    const countNumber = document.getElementById('countNumber');

    /* ======= Fetch Applicant Count ======= */
    const savedSheetLink = localStorage.getItem('agari_sheet_link');
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
            const queryUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&tq=SELECT count(A)&_nocache=${Date.now()}`;
            
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
                        if (count > 0) {
                            countNumber.innerText = count;
                            countBlock.style.display = 'inline-flex';
                        }
                    }
                })
                .catch(err => {
                    console.log("Cannot fetch count (có thể do sheet chưa bật chế độ public): ", err);
                });
        }
    }

    // Tự động làm mới số lượng mỗi 15 giây (chống người dùng treo tab)
    setInterval(() => {
        const currentLink = localStorage.getItem('agari_sheet_link');
        if (currentLink && !document.hidden) {
            fetchSheetCount(currentLink);
        }
    }, 15000);

    // Xử lý Validation và Submit
    submitBtn.addEventListener('click', function(e) {
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

        if (!isValid) {
            e.preventDefault(); // Chặn gửi form
            alert("⚠️ Vui lòng điền và chọn ĐẦY ĐỦ tất cả các thông tin bắt buộc (có dấu *) trước khi gửi!");
            if (firstInvalid) {
                firstInvalid.focus();
                firstInvalid.closest('.form-group').scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }
    });

    applyForm.addEventListener('submit', function(e) {
        submitBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> <span>ĐANG GỬI...</span>';
        submitBtn.style.opacity = '0.8';
        submitBtn.style.cursor = 'not-allowed';
    });

    // Check for success via URL params
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('success') === 'true') {
        applyForm.style.display = 'none';
        document.querySelector('.form-subtitle').style.display = 'none';
        
        // Hide QR button if present
        const btnScanQR = document.getElementById('btnScanQR');
        if (btnScanQR) btnScanQR.style.display = 'none';

        document.getElementById('successMessage').style.display = 'flex';
        
        // Clean URL without reloading page
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
                    readerDiv.innerHTML = '<div style="color:white; padding: 20px;">Đang xử lý ảnh, vui lòng chờ...</div>';
                }
                if (qrConfirmUI) qrConfirmUI.style.display = 'none';

                html5QrCode.scanFile(pendingImageFile, false)
                    .then(decodedText => {
                        onScanSuccess(decodedText);
                        if (pendingEventTarget) pendingEventTarget.value = '';
                        resetConfirmUI();
                    })
                    .catch(err => {
                        alert("Không thể đọc được mã QR từ ảnh. Lời khuyên: Hãy chụp GẦN SÁT vào khu vực mã QR ở góc thẻ để ảnh rõ nét nhất!");
                        console.log("Scan File Error: ", err);
                        if (pendingEventTarget) pendingEventTarget.value = '';
                        resetConfirmUI();
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
