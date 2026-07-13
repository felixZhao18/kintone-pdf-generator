// ==========================================================================
// 1. 外部ライブラリ（html2pdf.js）の動的インジェクション
// ==========================================================================
// グローバル環境に html2pdf が未定義の場合、CDN経由でスクリプトを非同期ロードします。
if (typeof html2pdf === 'undefined') {
  const script = document.createElement('script');
  // メインのCDN（jsdelivr）からライブラリを取得
  script.src = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';
  
  // メインCDNの読み込みに失敗した場合のフォールバック（代替）処理
  script.onerror = () => {
    const backupScript = document.createElement('script');
    backupScript.src = 'https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';
    document.head.appendChild(backupScript);
  };
  document.head.appendChild(script);
}

(() => {
  'use strict';

  // ==========================================================================
  // 2. kintone イベントリスナー：レコード詳細画面の表示時
  // ==========================================================================
  kintone.events.on('app.record.detail.show', event => {
    const record = event.record;
    
    // フォーム設定で配置したスペース「preview」の要素を取得
    const previewSpace = kintone.app.record.getSpaceElement('preview');
    if (!previewSpace) return; // スペースが存在しない場合は処理を中断

    // 重複描画を防ぐため、スペース内のコンテンツを初期化
    previewSpace.innerHTML = '';

    // --- PDFプレビュー生成用ボタンの作成とスタイリング ---
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

    // ボタンのホバーエフェクト（マウスオーバー時）
    btn.onmouseover = () => { btn.style.backgroundColor = '#34495e'; };
    btn.onmouseout = () => { btn.style.backgroundColor = '#2c3e50'; };

    // ボタンクリック時のイベント：多重クリック防止と処理中ステータスへの切り替え
    btn.onclick = () => {
      btn.disabled = true;
      btn.innerHTML = '⏳ PDF生成中...';
      btn.style.backgroundColor = '#95a5a6';
      
      // 実際のPDF生成および描画ロジック関数を実行
      generateReportPDF(record, previewSpace);
    };

    // 準備したボタンをkintoneのスペース内に配置
    previewSpace.appendChild(btn);
  });

  // ==========================================================================
  // 3. PDF生成・描画のコアロジック関数
  // ==========================================================================
  const generateReportPDF = (record, previewSpace) => {
    // レコードからアプリのタイトルを取得（未入力の場合はデフォルト値を使用）
    const title = record.アプリタイトル?.value || '業務報告書';
    
    // --- 【データ抽出】作成者（ユーザー選択フィールド）の解析 ---
    // kintoneの仕様上、オブジェクトや配列で返されるため、型判定を行いユーザー名を確実に抽出します。
    let author = '未設定';
    if (record.作成者?.value) {
      if (Array.isArray(record.作成者.value) && record.作成者.value.length > 0) {
        author = record.作成者.value[0].name || record.作成者.value[0].code || '未設定';
      } else if (typeof record.作成者.value === 'object') {
        author = record.作成者.value.name || '未設定';
      } else if (typeof record.作成者.value === 'string') {
        author = record.作成者.value;
      }
    }
    
    // --- 【データ抽出】所属部署（組織選択フィールド）の解析 ---
    let department = '未設定';
    if (record.組織選択?.value && record.組織選択.value.length > 0) {
      department = record.組織選択.value[0].name || '未設定';
    }
    
    // --- 【数据抽出】4つの基本情報項目（フィールドコードのバリエーションに対応） ---
    // 任意のフィールド名と、kintoneが自動生成するデフォルトのフィールドコードの両方を互換サポートします。
    const target = record.対象?.value || record.文字列__1行__1?.value || ''; 
    const startDate = record.実施開始日?.value || record.日付__0?.value || '----/--/--';
    const endDate = record.実施終了日?.value || record.日付__1?.value || '----/--/--';
    const place = record.実施場所?.value || record.文字列__1行__0?.value || '';

    // --- 【データ抽出】本文および動的表示項目（感想・備考） ---
    const reportContent = record.リッチエディター?.value || '<p>報告内容は空です。</p>';
    const kansou = record.文字列__複数行_?.value?.trim() || record.感想?.value?.trim() || '';
    const bikou = record.文字列__複数行__0?.value?.trim() || record.備考?.value?.trim() || '';

    // --- 【動的HTML制御】「感想」の表示有無判定 ---
    // データが存在する場合のみ、見出しと枠線付きのHTMLブロックを生成します（空の場合はレンダリング領域自体を非表示に）。
    let kansouHtml = '';
    if (kansou) {
      kansouHtml = `
        <div style="margin-top: 25px;">
          <h3 style="background: #2c3e50; color: #fff; padding: 10px 15px; margin: 0 0 15px 0; font-size: 15px; border-radius: 4px; font-weight: bold;">感想</h3>
          <div style="border: 1px solid #bdc3c7; padding: 20px; background: #ffffff; word-wrap: break-word; white-space: pre-wrap;">${kansou}</div>
        </div>
      `;
    }

    // --- 【動的HTML制御】「備考」の表示有無判定 ---
    // 「感想」と同様に、値がある場合のみHTMLを組み立てます。
    let bikouHtml = '';
    if (bikou) {
      bikouHtml = `
        <div style="margin-top: 25px;">
          <h3 style="background: #2c3e50; color: #fff; padding: 10px 15px; margin: 0 0 15px 0; font-size: 15px; border-radius: 4px; font-weight: bold;">備考</h3>
          <div style="border: 1px solid #bdc3c7; padding: 20px; background: #ffffff; word-wrap: break-word; white-space: pre-wrap;">${bikou}</div>
        </div>
      `;
    }

    // --- 【レイアウト構築】A4サイズに最適化した「非表示サンドボックス」HTML構造の定義 ---
    // 注意：`position: absolute; left: 0; top: 0; z-index: -99999;` によって画面上は見えませんが、
    // ドキュメント流の最上部に配置することで、html2canvasによるキャプチャ時のスクロールズレや余白の発生を完全に防止します。
    const reportHtml = `
      <div id="pdf-sandbox-container" style="position: absolute; left: 0; top: 0; width: 210mm; z-index: -99999; background: #ffffff; margin: 0; padding: 0; overflow: hidden; height: auto;">
        <style>
          #pdf-render-root, #pdf-render-root * {
            font-family: 'HG丸ｺﾞｼｯｸM-PRO', 'Hiragino Maru Gothic ProN', 'Meiryo', sans-serif !important;
            box-sizing: border-box;
          }
        </style>
        <div id="pdf-render-root" style="width: 210mm; padding: 20mm 20mm; color: #333; line-height: 1.8; font-size: 14px; background: #ffffff;">
          <!-- 報告書タイトル -->
          <h1 style="text-align: center; font-size: 26px; margin: 0 0 35px 0; border-bottom: 2px solid #2c3e50; padding-bottom: 15px; color: #2c3e50;">${title}</h1>
          
          <!-- 基本情報テーブル（3行 × 2列 の格子状レイアウト） -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 35px; font-size: 13px;">
            <tr>
              <th style="border: 1px solid #bdc3c7; background: #f8f9fa; padding: 12px; width: 15%; text-align: left; font-weight: bold;">作成者</th>
              <td style="border: 1px solid #bdc3c7; padding: 12px; width: 35%;">${author}</td>
              <th style="border: 1px solid #bdc3c7; background: #f8f9fa; padding: 12px; width: 15%; text-align: left; font-weight: bold;">所属部署</th>
              <td style="border: 1px solid #bdc3c7; padding: 12px; width: 35%;">${department}</td>
            </tr>
            <tr>
              <th style="border: 1px solid #bdc3c7; background: #f8f9fa; padding: 12px; text-align: left; font-weight: bold;">対象</th>
              <td style="border: 1px solid #bdc3c7; padding: 12px;">${target}</td>
              <th style="border: 1px solid #bdc3c7; background: #f8f9fa; padding: 12px; text-align: left; font-weight: bold;">実施場所</th>
              <td style="border: 1px solid #bdc3c7; padding: 12px;">${place}</td>
            </tr>
            <tr>
              <th style="border: 1px solid #bdc3c7; background: #f8f9fa; padding: 12px; text-align: left; font-weight: bold;">実施開始日</th>
              <td style="border: 1px solid #bdc3c7; padding: 12px;">${startDate}</td>
              <th style="border: 1px solid #bdc3c7; background: #f8f9fa; padding: 12px; text-align: left; font-weight: bold;">実施終了日</th>
              <td style="border: 1px solid #bdc3c7; padding: 12px;">${endDate}</td>
            </tr>
          </table>

          <!-- 報告内容（リッチエディター出力用） -->
          <div style="margin-top: 10px;">
            <h3 style="background: #2c3e50; color: #fff; padding: 10px 15px; margin: 0 0 20px 0; font-size: 16px; border-radius: 4px; font-weight: bold;">報告内容</h3>
            <div style="border: 1px solid #bdc3c7; padding: 30px; min-height: 400px; background: #ffffff; word-wrap: break-word;">
              ${reportContent}
            </div>
          </div>

          <!-- 動的に判定された感想と備考のブロックを挿入（空の場合は何も出力されません） -->
          ${kansouHtml}
          ${bikouHtml}
        </div>
      </div>
    `;

    // 生成した一時的なHTML要素をドキュメントのbodyノードへ一時的にマウント（追加）
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = reportHtml;
    document.body.appendChild(tempContainer);

    // --- html2pdf.js 専用の設定オプション ---
    const opt = {
      margin:       0, // 外側余白をゼロに（HTML側のpaddingで制御するため）
      filename:     `${title}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 }, // 画像化の画質設定
      html2canvas:  { 
        scale: 2,           // 解像度の倍率。数値を上げると文字が鮮明になりますがファイルサイズが増加します
        useCORS: true,      // クロスドメインの画像アセットが含まれる場合の許可設定
        logging: false,     // コンソールログの出力を無効化
        scrollY: 0,         // 【重要】kintone親画面のスクロール位置を無視し、絶対座標(0,0)からキャプチャを開始（空白ページ防止）
        scrollX: 0
      }, 
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }, // A4縦サイズ指定
      pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] } // 改ページ時の要素分断を防ぐ自動最適化アルゴリズム
    };

    // --- 非同期処理の同期実行およびレンダリング ---
    const triggerRender = () => {
      // ライブラリのロードが完了しているか再チェック
      if (typeof html2pdf !== 'undefined') {
        // サンドボックス内の描画ターゲット要素を取得
        const targetEl = document.getElementById('pdf-render-root');
        
        // HTMLからPDFデータストリング（Base64）へ変換処理を実行
        html2pdf().set(opt).from(targetEl).output('datauristring').then((pdfBase64) => {
          // プレビュースペースをクリーンアップ
          previewSpace.innerHTML = ''; 
          
          // インライン iframe を作成してPDFデータを流し込み、kintone画面上にプレビュー展開
          const iframe = document.createElement('iframe');
          iframe.style.width = '100%';
          iframe.style.height = '800px'; 
          iframe.style.border = '1px solid #dcdfe6';
          iframe.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
          iframe.src = pdfBase64;
          
          previewSpace.appendChild(iframe);
          
          // 処理が完了したため、DOM上の不要なサンドボックス用一時コンテナを完全に削除（メモリリーク防止）
          if (document.body.contains(tempContainer)) {
            document.body.removeChild(tempContainer);
          }
        }).catch((err) => {
          // 万が一のエラー発生時のエラーメッセージ表示
          previewSpace.innerHTML = '<div style="padding:20px; color:red;">PDF生成失敗: ' + err + '</div>';
        });
      } else {
        // ロードが間に合っていない場合は、100ミリ秒後に再帰判定を行います
        setTimeout(triggerRender, 100);
      }
    };
    
    // レンダリング実行のトリガーを引く
    triggerRender();
  };
})();