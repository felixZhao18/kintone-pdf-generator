// ==========================================================================
// 1. 外部ライブラリ（html2pdf.js）の読み込み待機
// ==========================================================================
window.__html2pdfLoadPromise = window.__html2pdfLoadPromise || new Promise((resolve, reject) => {
  const startTime = Date.now();
  const TIMEOUT_MS = 15000;
  const check = () => {
    if (typeof html2pdf !== 'undefined') {
      resolve();
      return;
    }
    if (Date.now() - startTime > TIMEOUT_MS) {
      reject(new Error(
        'html2pdf.js が読み込まれていません。kintoneの「JS/CSSで外観を変更する」設定を確認してください。'
      ));
      return;
    }
    setTimeout(check, 100);
  };
  check();
});

(() => {
  'use strict';

  const formatDatetime = (isoString) => {
    if (!isoString) return '----/--/-- --:--';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    
    return `${y}-${m}-${d} ${hh}:${mm}`;
  };

  const escapeHtml = (str) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const formatParagraphs = (str) => {
    if (!str) return '';
    const lines = str.split('\n');
    return lines.map(line => {
      const escaped = escapeHtml(line);
      if (!escaped.trim()) {
        return '<div style="height: 8px;"></div>';
      }
      return `<p class="pdf-p-block" style="margin: 0 0 6px 0; line-height: 1.5; page-break-inside: avoid !important; break-inside: avoid !important;">${escaped}</p>`;
    }).join('');
  };

  const showToast = (message) => {
    if (document.getElementById('limit-warning-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'limit-warning-toast';
    toast.innerHTML = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.backgroundColor = '#e74c3c';
    toast.style.color = '#fff';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '4px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.zIndex = '99999';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = 'bold';
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 4000);
  };

 // 顛末書タイプの書類かどうかを判定するヘルパー関数
  const isTenmatsuStyleType = (docType) => {
    return [
      '顛末書',
      'セキュリティインシデント・情報セキュリティ事象報告',
      '障害報告書'
    ].includes(docType);
  };

  // ==========================================================================
  // 2. 行数制限のイベントバインド（各新フィールドに対応）
  // ==========================================================================
  const registerLimitListener = () => {
    const bindInterval = setInterval(() => {
      const textareas = document.querySelectorAll('textarea');
      
      textareas.forEach((textarea) => {
        if (textarea.dataset.boundLimit) return;

        const fieldContainer = textarea.closest('.field-gaia, .control-value-gaia, div');
        const containerText = fieldContainer ? fieldContainer.innerText || '' : '';

        let maxLines = 25;
        if (containerText.includes('事象の概要') || containerText.includes('報告内容')) {
          maxLines = 50;
        } else if (containerText.includes('原因') || containerText.includes('暫定対処') || containerText.includes('本格対処') || containerText.includes('再発防止') || containerText.includes('感想') || containerText.includes('備考')) {
          maxLines = 20;
        }

        textarea.dataset.boundLimit = 'true';
        let lastVal = textarea.value;

        textarea.addEventListener('input', () => {
          const lines = textarea.value.split('\n').length;

          if (lines > maxLines) {
            textarea.value = lastVal;
            showToast(`⚠️ 枠内に収めるため、これ以上入力できません（最大 ${maxLines} 行まで）。`);
          } else {
            lastVal = textarea.value;
          }
        });
      });

    }, 300);

    setTimeout(() => clearInterval(bindInterval), 15000);
  };

  // ==========================================================================
  // 3. 画面制御（顛末書系：暫定対処・本格対処・再発防止策を表示）
  // ==========================================================================
  const toggleFieldsVisibility = (record) => {
    const documentType = record?.書類種別?.value || '報告書';

    const reportFields = ['対象', '実施場所', '実施開始日', '実施終了日', '報告内容', '感想', '備考'];
    const tenmatsuFields = ['発生日時', '発生場所', '事象の概要', '原因', '暫定対処', '本格対処', '再発防止策'];

    const isTenmatsuStyle = isTenmatsuStyleType(documentType);

    if (isTenmatsuStyle) {
      reportFields.forEach(field => kintone.app.record.setFieldShown(field, false));
      tenmatsuFields.forEach(field => kintone.app.record.setFieldShown(field, true));
      kintone.app.record.setFieldShown('添付資料', true);
    } else {
      reportFields.forEach(field => kintone.app.record.setFieldShown(field, true));
      tenmatsuFields.forEach(field => kintone.app.record.setFieldShown(field, false));
      kintone.app.record.setFieldShown('添付資料', false);
    }

    setTimeout(() => {
      const attachEl = kintone.app.record.getFieldElement('添付資料');
      if (attachEl) {
        attachEl.style.display = isTenmatsuStyle ? '' : 'none';
      }
    }, 100);
  };

  const showEvents = [
    'app.record.detail.show',
    'app.record.create.show',
    'app.record.edit.show',
    'app.record.print.show'
  ];
  kintone.events.on(showEvents, event => {
    const record = event.record;
    toggleFieldsVisibility(record);
    
    if (event.type === 'app.record.create.show' || event.type === 'app.record.edit.show') {
      registerLimitListener();
    }
    
    if (event.type === 'app.record.detail.show') {
      const previewSpace = kintone.app.record.getSpaceElement('preview');
      if (previewSpace) {
        previewSpace.innerHTML = '';
        const btn = document.createElement('button');
        btn.innerHTML = '📄 PDFプレビューを表示する';
        btn.style.padding = '12px 24px';
        btn.style.fontSize = '14px';
        btn.style.fontWeight = 'bold';
        btn.style.color = '#fff';
        btn.style.backgroundColor = '#2c3e50';
        btn.style.border = 'none';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
        btn.style.transition = 'all 0.2s ease';
        btn.style.margin = '10px 0';

        btn.onmouseover = () => { btn.style.backgroundColor = '#34495e'; };
        btn.onmouseout = () => { btn.style.backgroundColor = '#2c3e50'; };

        btn.onclick = () => {
          if (window.__pdfGenerating) return;
          window.__pdfGenerating = true;

          document.querySelectorAll('#pdf-sandbox-container').forEach(el => el.remove());

          btn.disabled = true;
          btn.innerHTML = '⏳ PDF生成中...';
          btn.style.backgroundColor = '#95a5a6';
          generateReportPDF(record, previewSpace, btn);
        };
        previewSpace.appendChild(btn);
      }
    }
    return event;
  });

  const changeEvents = [
    'app.record.create.change.書類種別',
    'app.record.edit.change.書類種別'
  ];
  kintone.events.on(changeEvents, event => {
    toggleFieldsVisibility(event.record);
    return event;
  });

  // ==========================================================================
  // 4. PDF生成・描画のコアロジック関数
  // ==========================================================================
  const generateReportPDF = (record, previewSpace, triggerBtn) => {
    const documentType = record.書類種別?.value || '報告書';
    const isTenmatsuStyle = isTenmatsuStyleType(documentType);
    const appTitle = documentType; // PDF標題將自動填入選取的選項名稱
    
    let author = '未設定';
    if (record.作成者?.value) {
      if (Array.isArray(record.作成者.value) && record.作成者.value.length > 0) {
        author = record.作成者.value[0].name || record.作成者.value[0].code || '未設定';
      } else if (typeof record.作成者.value === 'object') {
        author = record.作成者.value.name || '未設定';
      }
    }
    
    let department = '未設定';
    if (record.組織選択?.value && record.組織選択.value.length > 0) {
      department = record.組織選択.value[0].name || '未設定';
    }

    let middleTableHtml = ''; 
    let mainBodyHtml = '';  
    let additionalContentHtml = '';

    if (isTenmatsuStyle) {
      const rawOccurDate = record.発生日時?.value || '';
      const occurDate = formatDatetime(rawOccurDate);
      const occurPlace = escapeHtml(record.発生場所?.value || '');
      
      const summaryFormatted = formatParagraphs(record.事象の概要?.value || '事象の概要は空です。');
      const reasonFormatted = formatParagraphs(record.原因?.value?.trim() || '');
      
      const zanteiFormatted = formatParagraphs(record.暫定対処?.value?.trim() || '');
      const honkakuFormatted = formatParagraphs(record.本格対処?.value?.trim() || '');
      const saihatsuFormatted = formatParagraphs(record.再発防止策?.value?.trim() || '');

      middleTableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px;">
          <tr>
            <th style="border: 1px solid #dcdfe6; background: #f5f7fa; padding: 8px; width: 15%; text-align: left; font-weight: bold; color: #606266;">報告者</th>
            <td style="border: 1px solid #dcdfe6; padding: 8px; width: 35%; color: #303133;">${escapeHtml(author)}</td>
            <th style="border: 1px solid #dcdfe6; background: #f5f7fa; padding: 8px; width: 15%; text-align: left; font-weight: bold; color: #606266;">所属部署</th>
            <td style="border: 1px solid #dcdfe6; padding: 8px; width: 35%; color: #303133;">${escapeHtml(department)}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #dcdfe6; background: #f5f7fa; padding: 8px; text-align: left; font-weight: bold; color: #606266;">発生日時</th>
            <td style="border: 1px solid #dcdfe6; padding: 8px; color: #303133;">${occurDate}</td>
            <th style="border: 1px solid #dcdfe6; background: #f5f7fa; padding: 8px; text-align: left; font-weight: bold; color: #606266;">発生場所</th>
            <td style="border: 1px solid #dcdfe6; padding: 8px; color: #303133;">${occurPlace}</td>
          </tr>
        </table>
      `;

      mainBodyHtml = `
        <div class="section-group" style="margin-top: 10px;">
          <h3 style="background: #2c3e50; color: #fff; padding: 6px 12px; margin: 0 0 8px 0; font-size: 14px; border-radius: 4px; font-weight: bold;">事象の概要（顛末）</h3>
          <div style="border: 1px solid #dcdfe6; padding: 12px 15px 6px 15px; background: #ffffff; border-radius: 4px; color: #303133; font-size: 13.5px;">
            ${summaryFormatted}
          </div>
        </div>
      `;

      let reasonHtml = reasonFormatted ? `
        <div class="section-group" style="margin-top: 15px;">
          <h3 style="background: #2c3e50; color: #fff; padding: 6px 12px; margin: 0 0 8px 0; font-size: 14px; border-radius: 4px; font-weight: bold;">発生原因</h3>
          <div style="border: 1px solid #dcdfe6; padding: 10px 12px 4px 12px; background: #ffffff; border-radius: 4px; color: #303133; font-size: 13.5px;">
            ${reasonFormatted}
          </div>
        </div>
      ` : '';

      let zanteiHtml = zanteiFormatted ? `
        <div class="section-group" style="margin-top: 15px; page-break-inside: avoid !important; break-inside: avoid !important;">
          <h3 style="background: #2c3e50; color: #fff; padding: 6px 12px; margin: 0 0 8px 0; font-size: 14px; border-radius: 4px; font-weight: bold;">暫定対処</h3>
          <div style="border: 1px solid #dcdfe6; padding: 10px 12px 4px 12px; background: #ffffff; border-radius: 4px; color: #303133; font-size: 13.5px;">
            ${zanteiFormatted}
          </div>
        </div>
      ` : '';

      let honkakuHtml = honkakuFormatted ? `
        <div class="section-group" style="margin-top: 15px; page-break-inside: avoid !important; break-inside: avoid !important;">
          <h3 style="background: #2c3e50; color: #fff; padding: 6px 12px; margin: 0 0 8px 0; font-size: 14px; border-radius: 4px; font-weight: bold;">本格対処</h3>
          <div style="border: 1px solid #dcdfe6; padding: 10px 12px 4px 12px; background: #ffffff; border-radius: 4px; color: #303133; font-size: 13.5px;">
            ${honkakuFormatted}
          </div>
        </div>
      ` : '';

      let saihatsuHtml = saihatsuFormatted ? `
        <div class="section-group" style="margin-top: 15px; page-break-inside: avoid !important; break-inside: avoid !important;">
          <h3 style="background: #2c3e50; color: #fff; padding: 6px 12px; margin: 0 0 8px 0; font-size: 14px; border-radius: 4px; font-weight: bold;">再発防止策</h3>
          <div style="border: 1px solid #dcdfe6; padding: 10px 12px 4px 12px; background: #ffffff; border-radius: 4px; color: #303133; font-size: 13.5px;">
            ${saihatsuFormatted}
          </div>
        </div>
      ` : '';

      additionalContentHtml = reasonHtml + zanteiHtml + honkakuHtml + saihatsuHtml;

    } else {
      const target = escapeHtml(record.対象?.value || ''); 
      const startDate = record.実施開始日?.value || '----/--/--';
      const endDate = record.実施終了日?.value || '----/--/--';
      const place = escapeHtml(record.実施場所?.value || '');
      
      const reportFormatted = formatParagraphs(record.報告内容?.value || '報告内容は空です。');
      const kansouFormatted = formatParagraphs(record.感想?.value?.trim() || '');
      const bikouFormatted = formatParagraphs(record.備考?.value?.trim() || '');

      middleTableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px;">
          <tr>
            <th style="border: 1px solid #dcdfe6; background: #f5f7fa; padding: 8px; width: 15%; text-align: left; font-weight: bold; color: #606266;">作成者</th>
            <td style="border: 1px solid #dcdfe6; padding: 8px; width: 35%; color: #303133;">${escapeHtml(author)}</td>
            <th style="border: 1px solid #dcdfe6; background: #f5f7fa; padding: 8px; width: 15%; text-align: left; font-weight: bold; color: #606266;">所属部署</th>
            <td style="border: 1px solid #dcdfe6; padding: 8px; width: 35%; color: #303133;">${escapeHtml(department)}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #dcdfe6; background: #f5f7fa; padding: 8px; text-align: left; font-weight: bold; color: #606266;">対象</th>
            <td style="border: 1px solid #dcdfe6; padding: 8px; color: #303133;">${target}</td>
            <th style="border: 1px solid #dcdfe6; background: #f5f7fa; padding: 8px; text-align: left; font-weight: bold; color: #606266;">実施場所</th>
            <td style="border: 1px solid #dcdfe6; padding: 8px; color: #303133;">${place}</td>
          </tr>
          <tr>
            <th style="border: 1px solid #dcdfe6; background: #f5f7fa; padding: 8px; text-align: left; font-weight: bold; color: #606266;">実施開始日</th>
            <td style="border: 1px solid #dcdfe6; padding: 8px; color: #303133;">${startDate}</td>
            <th style="border: 1px solid #dcdfe6; background: #f5f7fa; padding: 8px; text-align: left; font-weight: bold; color: #606266;">実施終了日</th>
            <td style="border: 1px solid #dcdfe6; padding: 8px; color: #303133;">${endDate}</td>
          </tr>
        </table>
      `;

      mainBodyHtml = `
        <div class="section-group" style="margin-top: 10px;">
          <h3 style="background: #2c3e50; color: #fff; padding: 6px 12px; margin: 0 0 8px 0; font-size: 14px; border-radius: 4px; font-weight: bold;">報告内容</h3>
          <div style="border: 1px solid #dcdfe6; padding: 12px 15px 6px 15px; background: #ffffff; border-radius: 4px; color: #303133; font-size: 13.5px;">
            ${reportFormatted}
          </div>
        </div>
      `;

      let kansouHtml = kansouFormatted ? `
        <div class="section-group" style="margin-top: 15px; page-break-inside: avoid !important; break-inside: avoid !important;">
          <h3 style="background: #2c3e50; color: #fff; padding: 6px 12px; margin: 0 0 8px 0; font-size: 14px; border-radius: 4px; font-weight: bold;">感想</h3>
          <div style="border: 1px solid #dcdfe6; padding: 10px 12px 4px 12px; background: #ffffff; border-radius: 4px; color: #303133; font-size: 13.5px;">
            ${kansouFormatted}
          </div>
        </div>
      ` : '';

      let bikouHtml = bikouFormatted ? `
        <div class="section-group" style="margin-top: 15px; page-break-inside: avoid !important; break-inside: avoid !important;">
          <h3 style="background: #2c3e50; color: #fff; padding: 6px 12px; margin: 0 0 8px 0; font-size: 14px; border-radius: 4px; font-weight: bold;">備考</h3>
          <div style="border: 1px solid #dcdfe6; padding: 10px 12px 4px 12px; background: #ffffff; border-radius: 4px; color: #303133; font-size: 13.5px;">
            ${bikouFormatted}
          </div>
        </div>
      ` : '';

      additionalContentHtml = kansouHtml + bikouHtml;
    }

    const reportHtml = `
      <div id="pdf-sandbox-container" style="position: absolute; left: 0; top: 0; width: 210mm; z-index: -99999; background: #ffffff; margin: 0; padding: 0; overflow: hidden; height: auto;">
        <style>
          #pdf-render-root, #pdf-render-root * {
            font-family: 'HG丸ｺﾞｼｯｸM-PRO', 'Hiragino Maru Gothic ProN', 'Meiryo', sans-serif !important;
            box-sizing: border-box;
            word-break: break-all !important;
            overflow-wrap: anywhere !important;
          }

          h3 {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          .pdf-p-block {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        </style>

        <div id="pdf-render-root" style="width: 210mm; padding: 0 20mm 5mm 20mm; color: #333; line-height: 1.5; font-size: 13.5px; background: #ffffff;">
          
          <div style="box-sizing: border-box; margin-bottom: 10px;">
            <h1 style="text-align: center; font-size: 22px; margin: 0 0 15px 0; border-bottom: 2px solid #2c3e50; padding-bottom: 8px; color: #2c3e50; letter-spacing: 2px;">${appTitle}</h1>
            ${middleTableHtml}
          </div>

          ${mainBodyHtml}

          ${additionalContentHtml}
          
        </div>
      </div>
    `;

    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = reportHtml;
    document.body.appendChild(tempContainer);

    const opt = {
      margin:        [22, 0, 12, 0],
      filename:     `${appTitle}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { 
        scale: 2, 
        useCORS: true, 
        logging: false, 
        scrollY: 0, 
        scrollX: 0
      }, 
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['css', 'legacy'] }
    };

    const cleanupAndReset = () => {
      if (document.body.contains(tempContainer)) {
        document.body.removeChild(tempContainer);
      }
      window.__pdfGenerating = false;
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = '📄 PDFプレビューを表示する';
        triggerBtn.style.backgroundColor = '#2c3e50';
      }
    };

    const waitFontsReady = (document.fonts && document.fonts.ready)
      ? document.fonts.ready
      : Promise.resolve();

    Promise.all([window.__html2pdfLoadPromise, waitFontsReady])
      .then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      .then(() => {
        const targetEl = document.getElementById('pdf-render-root');

        return html2pdf().set(opt).from(targetEl).toPdf().get('pdf').then((pdf) => {
          const totalPages = pdf.internal.getNumberOfPages();
          const authorText = isTenmatsuStyle ? '報告者' : '作成者';
          
          for (let i = 1; i <= totalPages; i++) {
            pdf.setPage(i);
            
            if (i > 1) {
              const headerCanvas = document.createElement('canvas');
              headerCanvas.width = 1600;
              headerCanvas.height = 80;
              const ctx = headerCanvas.getContext('2d');
              
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, 1600, 80);
              
              ctx.font = "normal 24px sans-serif";
              ctx.fillStyle = "#7f8c8d";
              ctx.fillText(`${appTitle} (続紙)`, 0, 40);
              
              ctx.textAlign = "right";
              ctx.fillText(`${authorText}: ${author}`, 1600, 40);
              
              ctx.strokeStyle = "#2c3e50";
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(0, 60);
              ctx.lineTo(1600, 60);
              ctx.stroke();

              const headerImgData = headerCanvas.toDataURL('image/png');
              pdf.addImage(headerImgData, 'PNG', 20, 8, 170, 8.5);
            }

            pdf.setFontSize(10);
            pdf.setTextColor(127, 140, 141);
            pdf.text(`${i} / ${totalPages}`, 105, 289, { align: 'center' });
          }

          return pdf.output('blob');
        });
      })
      .then((pdfBlob) => {
        previewSpace.innerHTML = ''; 
        
        const blobUrl = URL.createObjectURL(pdfBlob);
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '800px'; 
        iframe.style.border = '1px solid #dcdfe6';
        iframe.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
        iframe.src = blobUrl;
        
        previewSpace.appendChild(iframe);
        cleanupAndReset();
      })
      .catch((err) => {
        console.error(err);
        previewSpace.innerHTML = '<div style="padding:20px; color:red; font-weight:bold;">PDF生成エラー: ' + (err.message || err) + '</div>';
        cleanupAndReset();
      });
  };
})();
