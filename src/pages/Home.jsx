import React, { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';

// Known company domains - this would be your database/API
const KNOWN_COMPANY_EMAILS = {
  'example.com': true,
  'acme.org': true,
  'yourcompany.com': true,
  // Add more known company domains
};

// Common domain corrections
const DOMAIN_CORRECTIONS = {
  'gmail.cm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.net': 'gmail.com',
  'hotmail.cm': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'homail.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmail.net': 'hotmail.com',
  'yahoo.cm': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.net': 'yahoo.com',
  'outlook.cm': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outook.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'icloud.cm': 'icloud.com',
  'icloud.con': 'icloud.com',
  'iclod.com': 'icloud.com',
};

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
  
  const ZEROBOUNCE_API_KEY = 'c8086c20aaf440b4b568a734bc1fa0ec';
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
  
  // Validate emails using ZeroBounce API
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
      const validationPromises = batch.map(email => validateSingleEmail(email));
      
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
  
  // Validate a single email
  const validateSingleEmail = async (email) => {
    // Initial result object
    let result = {
      originalEmail: email,
      correctedEmail: email,
      isValid: false,
      status: 'Invalid',
      message: ''
    };
    
    try {
      // Step 1: Basic Format Check & Initial Syntax Fixes
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        result.message = 'Invalid email format';
        return result;
      }
      
      // Split email into parts
      let [username, domainPart] = email.split('@');
      
      // Normalize case immediately for consistent checking
      username = username.toLowerCase();
      domainPart = domainPart.toLowerCase();
      
      // Initial email correction based on common typos
      let correctedDomainPart = domainPart;
      
      // Check for common domain typos
      if (DOMAIN_CORRECTIONS[domainPart]) {
        correctedDomainPart = DOMAIN_CORRECTIONS[domainPart];
        result.correctedEmail = `${username}@${correctedDomainPart}`;
        result.message = `Corrected domain from ${domainPart} to ${correctedDomainPart}`;
        result.status = 'Needs Review';
      } else {
        result.correctedEmail = `${username}@${domainPart}`;
      }
      
      // Step 2: Check Against Company List
      const domain = correctedDomainPart;
      let skipZeroBounce = false;
      
      if (KNOWN_COMPANY_EMAILS[domain]) {
        // If it's a known company email, mark as valid and skip ZeroBounce check
        skipZeroBounce = true;
        result.isValid = true;
        result.status = 'Valid';
        result.message = result.message 
          ? `${result.message}. Email domain is from known company list.` 
          : 'Email domain is from known company list';
      }
      
      // Step 3: Use ZeroBounce API for emails not in company list
      if (!skipZeroBounce) {
        try {
          const zeroBounceResult = await callZeroBounceAPI(result.correctedEmail);
          
          // Update results based on ZeroBounce response
          result.isValid = zeroBounceResult.status === 'valid';
          result.status = zeroBounceResult.status === 'valid' ? 'Valid' : 'Invalid';
          
          // Add API validation message
          result.message = result.message 
            ? `${result.message}. ZeroBounce status: ${zeroBounceResult.status}.` 
            : `ZeroBounce status: ${zeroBounceResult.status}`;
          
          // Step 4: Check "Did You Mean" suggestions from ZeroBounce
          if (zeroBounceResult.did_you_mean) {
            result.correctedEmail = zeroBounceResult.did_you_mean;
            result.message = `${result.message} ZeroBounce suggested correction: ${zeroBounceResult.did_you_mean}`;
            result.status = 'Needs Review';
          }
        } catch (apiError) {
          console.error(`ZeroBounce API error for ${email}:`, apiError);
          result.message = `API validation error: ${apiError.message || 'Unknown error'}`;
          result.status = 'Needs Review';
        }
      }
      
      // Step 5: Final Syntax Cleanup
      // Extract parts again using the potentially corrected email
      [username, domainPart] = result.correctedEmail.split('@');
      
      // Remove + suffix from username
      if (username.includes('+')) {
        const cleanUsername = username.split('+')[0];
        result.correctedEmail = `${cleanUsername}@${domainPart}`;
        result.message = result.message 
          ? `${result.message}. Removed + suffix from username.` 
          : 'Removed + suffix from username';
        
        if (result.status === 'Valid') {
          result.status = 'Needs Review';
        }
      }
      
      // Ensure email is lowercase
      const lowercaseEmail = result.correctedEmail.toLowerCase();
      if (result.correctedEmail !== lowercaseEmail) {
        result.correctedEmail = lowercaseEmail;
        result.message = result.message 
          ? `${result.message}. Normalized case.` 
          : 'Normalized case';
      }
      
      // Remove any leading/trailing whitespace
      const trimmedEmail = result.correctedEmail.trim();
      if (result.correctedEmail !== trimmedEmail) {
        result.correctedEmail = trimmedEmail;
        result.message = result.message 
          ? `${result.message}. Removed whitespace.` 
          : 'Removed whitespace';
      }
      
      // Final classification refinement
      if (result.correctedEmail === email && result.isValid) {
        // Email is valid and unchanged
        result.status = 'Valid';
        result.message = 'Email is valid';
      } else if (result.correctedEmail !== email && result.isValid) {
        // Email was corrected but is valid
        result.status = 'Needs Review';
        result.message = `Suggested correction: ${result.correctedEmail}. ${result.message}`;
      }
      
      return result;
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
  
  // Call ZeroBounce API
  const callZeroBounceAPI = async (email) => {
    try {
      const apiUrl = `https://api.zerobounce.net/v2/validate?api_key=${ZEROBOUNCE_API_KEY}&email=${encodeURIComponent(email)}`;
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error("ZeroBounce API error:", error);
      throw error;
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
  const reviewCount = validationResults.filter(r => r.status === 'Needs Review').length;
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'Valid':
        return '#4CAF50'; // Green
      case 'Invalid':
        return '#F44336'; // Red
      case 'Needs Review':
        return '#FF9800'; // Orange
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
                  backgroundColor: '#FF9800',
                  borderRadius: '50%'
                }}></span>
                <span>Needs Review: {reviewCount}</span>
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