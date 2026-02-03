const printWithCharts = async (elementId, title, company, period) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    // Find all chart containers
    const chartContainers = element.querySelectorAll('.chart-container, .recharts-wrapper');
    const originalContents = [];

    // Convert each chart to image
    for (let i = 0; i < chartContainers.length; i++) {
      const container = chartContainers[i];
      originalContents.push({
        element: container,
        innerHTML: container.innerHTML
      });

      try {
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/png');
        img.style.width = '100%';
        img.style.maxWidth = container.offsetWidth + 'px';
        container.innerHTML = '';
        container.appendChild(img);
      } catch (err) {
        console.log('Chart conversion skipped:', err);
      }
    }

    // Print
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; margin: 0; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
          .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #3b82f6; }
          .header h1 { margin: 0; color: #1e293b; font-size: 24px; }
          .header h2 { margin: 5px 0 0 0; color: #3b82f6; font-size: 16px; }
          .header p { margin: 5px 0 0 0; color: #64748b; font-size: 12px; }
          .header .date { text-align: right; color: #64748b; font-size: 11px; }
          img { max-width: 100%; height: auto; }
          .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #64748b; text-align: center; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>${company?.tradingAs || company?.name || 'Company'}</h1>
            <h2>${title}</h2>
            <p>${period}</p>
          </div>
          <div class="date">Generated: ${new Date().toLocaleString()}</div>
        </div>
        ${element.innerHTML}
        <div class="footer">ProcureFlow Job Costing System • ${company?.tradingAs || company?.name} • Report generated on ${new Date().toLocaleString()}</div>
      </body>
      </html>
    `);
    printWindow.document.close();

    // Wait for images to load then print
    setTimeout(() => {
      printWindow.print();
    }, 1000);

    // Restore original chart content
    setTimeout(() => {
      originalContents.forEach(({ element, innerHTML }) => {
        element.innerHTML = innerHTML;
      });
    }, 2000);

  } catch (error) {
    console.error('Print error:', error);
    window.print();
  }
};