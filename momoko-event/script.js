// 回答者向けURL。Googleフォームの編集URLは公開サイトへ設定しません。
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeGKpLJg4jU9-dNieuWgX0oE5nd9CL5B1S7CiTIeBtJNXR29A/viewform';

document.querySelectorAll('[data-form-link]').forEach((link) => {
  if (FORM_URL) {
    link.href = FORM_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return;
  }

  link.addEventListener('click', (event) => {
    event.preventDefault();
    const status = document.querySelector('[data-form-status]');
    if (!status) return;
    status.textContent = '申込フォームは現在、公開準備中です。公開後にこのボタンからお申し込みいただけます。';
    status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
});

