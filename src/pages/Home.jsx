import React, { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';

const Home = () => {
  const [file, setFile] = useState(null);
  const [emails, setEmails] = useState([]);
  const [validationResults, setValidationResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [selectedEmailColumn, setSelectedEmailColumn] = useState('');
  const [processingMessage, setProcessingMessage] = useState('');
  const fileInputRef = useRef(null);
  
  // API configuration - update with your actual API URL
  const API_URL = 'https://validation-p43s9ldbm-josiahs-projects-e4873166.vercel.app';
  const MAX_BATCH_SIZE = 10; // Number of emails to process in parallel
  
  // Handle file upload
  const handleFileUpload = (event) => {
    if (event.target.files && event.target.files.length > 0) {
      const uploadedFile = event.target.files[0];
      setFile(uploadedFile);
      
      // Parse the CSV to detect headers
      Papa.parse(uploadedFile, {
        header: true,
        skipEmptyLines: true,
        preview: 3, // Just need a few rows to detect headers
        complete: (results) => {
          if (results.meta && results.meta.fields) {
            setCsvHeaders(results.meta.fields);
            // Auto-select a column if one contains 'email'
            const emailColumn = results.meta.fields.find(field => 
              field.toLowerCase().includes('email')
            );
            if (emailColumn) {
              setSelectedEmailColumn(emailColumn);
            }
          }
        }
      });
    }
  };
  
  // Parse the CSV file and extract emails
  const parseCSV = useCallback(() => {
    if (!file || !selectedEmailColumn) return;
    
    setIsProcessing(true);
    setProcessingMessage('Reading CSV file...');
    setProgress(0);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const extractedEmails = [];
        
        // Extract emails from the selected column
        results.data.forEach((row) => {
          const email = row[selectedEmailColumn]?.trim();
          if (email) {
            extractedEmails.push(email);
          }
        });
        
        setEmails(extractedEmails);
        setProcessingMessage(`Found ${extractedEmails.length} emails. Starting validation...`);
        
        // Once emails are extracted, start validation
        validateEmails(extractedEmails);
      }
    });
  }, [file, selectedEmailColumn]);
  
  // Validate emails using external API
  const validateEmails = async (emailsToValidate) => {
    if (emailsToValidate.length === 0) {
      setIsProcessing(false);
      return;
    }
    
    // Initialize results array
    const results = [];
    let processedCount = 0;
    
    // Process emails in batches to avoid rate limiting
    for (let i = 0; i < emailsToValidate.length; i += MAX_BATCH_SIZE) {
      const batch = emailsToValidate.slice(i, i + MAX_BATCH_SIZE);
      const validationPromises = batch.map(email => validateSingleEmailViaAPI(email));
      
      try {
        const batchResults = await Promise.all(validationPromises);
        results.push(...batchResults);
        
        processedCount += batch.length;
        const progressPercent = Math.round((processedCount / emailsToValidate.length) * 100);
        setProgress(progressPercent);
        setProcessingMessage(`Processed ${processedCount} of ${emailsToValidate.length} emails (${progressPercent}%)...`);
        
        // Update results incrementally
        setValidationResults([...results]);
        
        // Small delay to prevent API rate limiting
        if (i + MAX_BATCH_SIZE < emailsToValidate.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error("Error processing batch:", error);
        setProcessingMessage(`Error occurred during validation. Check console for details.`);
      }
    }
    
    setIsProcessing(false);
    setProcessingMessage(`Completed validation of ${emailsToValidate.length} emails.`);
  };
  
  // Validate a single email via API
  const validateSingleEmailViaAPI = async (email) => {
    try {
      // Call the external validation API
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
      });
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'API validation failed');
      }
      
      // Return the validation data from the API
      return result.data;
      
    } catch (error) {
      console.error(`Error validating ${email}:`, error);
      return {
        originalEmail: email,
        correctedEmail: email,
        isValid: false,
        status: 'Invalid',
        message: `Error during validation: ${error.message || 'Unknown error'}`
      };
    }
  };
  
  // Reset form
  const handleReset = () => {
    setFile(null);
    setEmails([]);
    setValidationResults([]);
    setProgress(0);
    setIsProcessing(false);
    setProcessingMessage('');
    setCsvHeaders([]);
    setSelectedEmailColumn('');
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Export validated results to CSV
  const exportToCSV = () => {
    if (validationResults.length === 0) return;
    
    const csv = Papa.unparse({
      fields: ['Original Email', 'Corrected Email', 'Status', 'Message'],
      data: validationResults.map(result => [
        result.originalEmail,
        result.correctedEmail,
        result.status,
        result.message
      ])
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'validated_emails.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // Stats for summary
  const validCount = validationResults.filter(r => r.status === 'Valid').length;
  const invalidCount = validationResults.filter(r => r.status === 'Invalid').length;
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'Valid':
        return '#4CAF50'; // Green
      case 'Invalid':
        return '#F44336'; // Red
      default:
        return '#9E9E9E'; // Grey
    }
  };
  
  return (
    <div style={{ 
      fontFamily: 'Arial, sans-serif',
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '20px',
      boxShadow: '0 0 10px rgba(0,0,0,0.1)',
      borderRadius: '8px',
      backgroundColor: '#ffffff'
    }}>
      <h1 style={{ 
        color: '#333',
        borderBottom: '2px solid #eee',
        paddingBottom: '10px',
        marginBottom: '20px'
      }}>
        Bulk Email Validation Tool
      </h1>
      
      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ color: '#444', marginBottom: '15px' }}>Upload CSV File</h2>
        
        <div style={{ 
          display: 'flex',
          flexDirection: 'column',
          gap: '15px'
        }}>
          <div style={{
            border: '2px dashed #ddd',
            borderRadius: '4px',
            padding: '20px',
            textAlign: 'center'
          }}>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              ref={fileInputRef}
              style={{ display: 'none' }}
              id="csv-upload"
            />
            <label 
              htmlFor="csv-upload" 
              style={{
                backgroundColor: '#2196F3',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'inline-block',
                marginBottom: '10px'
              }}
            >
              Choose CSV File
            </label>
            
            {file && (
              <p style={{ margin: '10px 0 0' }}>
                Selected file: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>
          
          {csvHeaders.length > 0 && (
            <div style={{
              padding: '15px',
              backgroundColor: '#f9f9f9',
              borderRadius: '4px',
              border: '1px solid #eee'
            }}>
              <label htmlFor="email-column" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Select Email Column:
              </label>
              <select
                id="email-column"
                value={selectedEmailColumn}
                onChange={(e) => setSelectedEmailColumn(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd'
                }}
              >
                <option value="">-- Select Column --</option>
                {csvHeaders.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={parseCSV}
              disabled={!file || !selectedEmailColumn || isProcessing}
              style={{
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: (!file || !selectedEmailColumn || isProcessing) ? 'not-allowed' : 'pointer',
                opacity: (!file || !selectedEmailColumn || isProcessing) ? 0.7 : 1,
                flex: 1
              }}
            >
              {isProcessing ? 'Processing...' : 'Validate Emails'}
            </button>
            
            <button
              onClick={handleReset}
              disabled={isProcessing}
              style={{
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                opacity: isProcessing ? 0.7 : 1
              }}
            >
              Reset
            </button>
            
            <button
              onClick={exportToCSV}
              disabled={validationResults.length === 0 || isProcessing}
              style={{
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: (validationResults.length === 0 || isProcessing) ? 'not-allowed' : 'pointer',
                opacity: (validationResults.length === 0 || isProcessing) ? 0.7 : 1
              }}
            >
              Export Results
            </button>
          </div>
        </div>
      </section>
      
      {isProcessing && (
        <section style={{ marginBottom: '30px' }}>
          <div style={{
            backgroundColor: '#e1f5fe',
            padding: '15px',
            borderRadius: '4px',
            marginBottom: '15px'
          }}>
            <p style={{ margin: '0 0 10px 0' }}>{processingMessage}</p>
            <div style={{ 
              height: '20px',
              backgroundColor: '#b3e5fc',
              borderRadius: '10px',
              overflow: 'hidden'
            }}>
              <div 
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  backgroundColor: '#0288d1',
                  transition: 'width 0.3s ease'
                }}
              ></div>
            </div>
            <p style={{ textAlign: 'center', margin: '5px 0 0 0' }}>{progress}%</p>
          </div>
        </section>
      )}
      
      {validationResults.length > 0 && (
        <section>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '20px'
          }}>
            <h2 style={{ color: '#444', margin: '0' }}>Validation Results</h2>
            
            <div style={{ display: 'flex', gap: '15px' }}>
              <div style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <span style={{ 
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  backgroundColor: '#4CAF50',
                  borderRadius: '50%'
                }}></span>
                <span>Valid: {validCount}</span>
              </div>
              
              <div style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <span style={{ 
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  backgroundColor: '#F44336',
                  borderRadius: '50%'
                }}></span>
                <span>Invalid: {invalidCount}</span>
              </div>
            </div>
          </div>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)'
            }}>
              <thead>
                <tr style={{
                  backgroundColor: '#f5f5f5',
                  borderBottom: '2px solid #ddd'
                }}>
                  <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>Original Email</th>
                  <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>Corrected Email</th>
                  <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {validationResults.map((result, index) => (
                  <tr key={index} style={{
                    backgroundColor: index % 2 === 0 ? '#fff' : '#f9f9f9',
                    borderBottom: '1px solid #ddd'
                  }}>
                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>{result.originalEmail}</td>
                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                      {result.correctedEmail !== result.originalEmail ? (
                        <span style={{ backgroundColor: '#e8f5e9', padding: '2px 5px', borderRadius: '3px' }}>
                          {result.correctedEmail}
                        </span>
                      ) : (
                        result.correctedEmail
                      )}
                    </td>
                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                      <span style={{
                        backgroundColor: getStatusColor(result.status),
                        color: 'white',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        display: 'inline-block'
                      }}>
                        {result.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>{result.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default Home;