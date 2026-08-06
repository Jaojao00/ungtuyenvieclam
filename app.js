import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, getDocs, getCountFromServer, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD0C8eegdDsbkPW6hW8ggKzIoGCeXH-pHQ",
  authDomain: "agari-tuyen-dung.firebaseapp.com",
  projectId: "agari-tuyen-dung",
  storageBucket: "agari-tuyen-dung.firebasestorage.app",
  messagingSenderId: "649100852559",
  appId: "1:649100852559:web:a147430d1fcaccccc4993a",
  measurementId: "G-B5WWFQ6CZG"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const applicantsCollection = collection(db, "applicants");

document.addEventListener("DOMContentLoaded", function() {
    const applyForm = document.getElementById('applyForm');
    const submitBtn = document.getElementById('submitBtn');
    const countNumber = document.getElementById('countNumber');
    
    // Ẩn nút Admin cũ vì giờ quản lý trên Firebase
    const btnAdmin = document.getElementById('btnAdmin');
    if (btnAdmin) btnAdmin.style.display = 'none';

    /* ======= Fetch Applicant Count từ Firebase ======= */
    async function fetchApplicantCount() {
        try {
            const snapshot = await getCountFromServer(applicantsCollection);
            countNumber.innerText = snapshot.data().count;
        } catch (error) {
            console.error("Lỗi khi đếm số lượng:", error);
            countNumber.innerText = "N/A";
        }
    }

    // Đếm lần đầu
    fetchApplicantCount();

    // Tự động làm mới số lượng mỗi 15 giây
    setInterval(() => {
        if (!document.hidden) {
            fetchApplicantCount();
        }
    }, 15000);


    /* ======= Hàm kiểm tra trùng lặp qua Firestore ======= */
    async function checkDuplicate(phone, cccd) {
        try {
            // Kiểm tra CCCD
            const qCccd = query(applicantsCollection, where("cccd", "==", cccd));
            const snapshotCccd = await getDocs(qCccd);
            if (!snapshotCccd.empty) return true;

            // Kiểm tra SĐT
            const qPhone = query(applicantsCollection, where("phone", "==", phone));
            const snapshotPhone = await getDocs(qPhone);
            if (!snapshotPhone.empty) return true;

            return false;
        } catch(err) {
            console.error("Lỗi khi check trùng lặp:", err);
            // Nếu có lỗi mạng, chặn submit để an toàn, hoặc cho qua tùy nghiệp vụ. Ở đây báo lỗi:
            alert("Đã xảy ra lỗi khi kết nối máy chủ. Vui lòng thử lại sau.");
            return true; // Chặn lại
        }
    }


    /* ======= Đồng bộ dữ liệu sang Google Sheets (Background Sync) ======= */
    function submitToGoogleForm(dataObj) {
        const formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSd3XseDNvnpvxjG9ay_r0fjlOLeNOlo9Wbll5gvaWlpbcABww/formResponse";
        
        // Tạo URLSearchParams để format dữ liệu thành dạng x-www-form-urlencoded
        const formData = new URLSearchParams();
        
        // Ánh xạ lại tên trường (key) sang dạng entry.XXX của Google Form
        formData.append("entry.400419397", dataObj.fullName || "");
        formData.append("entry.1656052568", dataObj.gender || "");
        formData.append("entry.2090134030", dataObj.dob || "");
        formData.append("entry.531147708", dataObj.phone || "");
        formData.append("entry.1116838991", dataObj.cccd || "");
        formData.append("entry.1816975943", dataObj.address || "");
        formData.append("entry.590641482", dataObj.currentAddress || "");
        formData.append("entry.1849515334", dataObj.shift || "");
        formData.append("entry.1059679510", dataObj.vnidLevel2 || "");
        formData.append("entry.374361314", dataObj.otherInsurance || "");
        formData.append("entry.988164786", dataObj.unemploymentInsurance || "");

        // Gửi request ngầm, không cần quan tâm response (vì no-cors)
        fetch(formUrl, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: formData.toString()
        }).catch(err => console.log("Lỗi đồng bộ GSheet (background):", err));
    }

    /* ======= Xử lý Submit Form ======= */
    submitBtn.addEventListener('click', async function(e) {
        e.preventDefault(); 
        
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
        submitBtn.style.pointerEvents = 'none';

        // Lấy SĐT và CCCD để check trùng
        const phone = document.getElementById('phone').value.trim();
        const cccd = document.getElementById('cccd').value.trim();

        const isDuplicate = await checkDuplicate(phone, cccd);
        
        if (isDuplicate) {
            alert("❌ Số Điện Thoại hoặc Số CCCD này đã được đăng ký trước đó, hoặc kết nối mạng có vấn đề. Bạn không thể nộp thêm!");
            submitBtn.innerHTML = originalBtnHTML;
            submitBtn.style.opacity = '1';
            submitBtn.style.pointerEvents = 'auto';
            return; 
        }

        // Gửi data lên Firebase
        submitBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> <span>ĐANG GỬI...</span>';
        
        // Thu thập dữ liệu từ form
        const formData = new FormData(applyForm);
        const dataObj = Object.fromEntries(formData.entries());
        // Thêm timestamp để biết lúc gửi
        dataObj.timestamp = serverTimestamp();

        try {
            // Lưu vào Firestore (Bảo mật gốc)
            await addDoc(applicantsCollection, dataObj);
            
            // Đồng bộ ngầm lên Google Sheets cũ
            submitToGoogleForm(dataObj);
            
            // Xử lý UI thành công
            applyForm.style.display = 'none';
            document.querySelector('.form-subtitle').style.display = 'none';
            document.getElementById('successMessage').style.display = 'flex';
            
            // Cập nhật lại số lượng ngay lập tức
            fetchApplicantCount();
            
        } catch (error) {
            console.error("Lỗi khi thêm hồ sơ:", error);
            alert("❌ Gặp lỗi khi gửi hồ sơ. Vui lòng thử lại sau.");
            submitBtn.innerHTML = originalBtnHTML;
            submitBtn.style.opacity = '1';
            submitBtn.style.pointerEvents = 'auto';
        }
    });

    // Check for success via URL params (Giữ lại nếu người dùng ấn F5 ở URL cũ)
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('success') === 'true') {
        applyForm.style.display = 'none';
        document.querySelector('.form-subtitle').style.display = 'none';
        document.getElementById('successMessage').style.display = 'flex';
        // Xóa param
        if (window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
});
