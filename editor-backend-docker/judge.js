const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const testcaseProgress = new Map();

const execute = async (req, res) => {
    let id = null;
    try {
        const { testcases, checkerCode, userCode, language,timeLimit, submissionId } = req.body;
        const jobId = uuidv4();
        const jobDir = path.join(__dirname, 'codes', jobId);

        testcaseProgress.set(submissionId, 0);

        try {
            fs.mkdirSync(jobDir, { recursive: true });
            fs.writeFileSync(path.join(jobDir, 'checker.cpp'), checkerCode);
            const testLibPath = path.join(__dirname, 'testlib.h');
            fs.copyFileSync(testLibPath, path.join(jobDir, 'testlib.h'));
        } catch (e) {
            return res.json({
                errType: "File Handling Error",
                errMessage: e.message
            });
        }

        let userFile = '';
        if (language === 'cpp') userFile = 'userCode.cpp';
        else if (language === 'python') userFile = 'userCode.py';
        else if (language === 'java') userFile = 'userCode.java';
        else if (language === 'javascript') userFile = 'userCode.js';

        try {
            fs.writeFileSync(path.join(jobDir, userFile), userCode);
        } catch (e) {
            return res.json({
                errType: "File Handling Error",
                errMessage: e.message
            });
        }

        const dirPath = jobDir.replace(/\\/g, "/");

        try {
            let setUpCommand = `docker run -dit -v "${dirPath}:/app" gcc-with-time bash`;
            id = execSync(setUpCommand).toString().trim();
        } catch (e) {
            return res.json({
                errType: "Docker Error",
                errMessage: e.stderr?.toString() || e.message
            });
        }

        try {
            execSync(`docker start ${id}`);
        } catch (e) {
            return res.json({
                errType: "Docker Start Error",
                errMessage: e.stderr?.toString() || e.message
            });
        }

        try {
            if(language === 'cpp'){
                execSync(`docker exec ${id} bash -c "cd /app && g++ userCode.cpp -o userCode"`);
            } else if(language === 'java'){
                execSync(`docker exec ${id} bash -c "cd /app && javac userCode.java"`);
            }
        } catch (e) {
            return res.json({
                errType: "Compilation Error",
                errMessage: e.stderr?.toString() || e.stdout?.toString() || e.message
            });
        }

        try {
            execSync(`docker exec ${id} bash -c "cd /app && g++ checker.cpp -o customCheck"`);
        } catch (e) {
            return res.json({
                errType: "Compilation Error From Server Side",
                errMessage: e.stderr?.toString() || e.stdout?.toString() || e.message
            });
        }

        const inputPath = path.join(jobDir, 'input.txt');
        const outputPath = path.join(jobDir, 'output.txt');
        const answerPath = path.join(jobDir, 'answer.txt');
        const resultPath = path.join(jobDir, 'result.txt');
        const timePath = path.join(jobDir, 'time.txt');
        const exitCodePath = path.join(jobDir, 'exitCode.txt');

        let verdicts = [];
        let overAllStatus = "Accepted";
        let runtime = 0;
        let errType="";
        let errMessage="";
        for (let i = 0; i < testcases.length; i++) {
            try {
                testcaseProgress.set(submissionId, i + 1);

                fs.writeFileSync(inputPath, testcases[i].input);
                fs.writeFileSync(answerPath, testcases[i].expected);
                fs.writeFileSync(outputPath, '');
                fs.writeFileSync(resultPath, '');
                fs.writeFileSync(timePath, '');
                fs.writeFileSync(exitCodePath, '');

                execSync(`docker cp "${inputPath}" ${id}:/app/input.txt`);
                execSync(`docker cp "${answerPath}" ${id}:/app/answer.txt`);

                let runCommand = "";

                if(language === 'cpp'){
                    runCommand = `timeout ${timeLimit} ./userCode < input.txt > output.txt`;
                } else if(language === 'python'){
                    runCommand = `timeout ${timeLimit} python3 userCode.py < input.txt > output.txt`;
                } else if(language === 'java'){
                    runCommand = `timeout ${timeLimit} java userCode < input.txt > output.txt`;
                } else if(language === 'javascript'){
                    runCommand = `timeout ${timeLimit} node userCode.js < input.txt > output.txt`;
                }

                execSync(`docker exec ${id} bash -c "cd /app && \
                    start=\$(date +%s%3N); \
                    ${runCommand}; \
                    exit_code=\$?; \
                    end=\$(date +%s%3N); \
                    echo \$exit_code > exitCode.txt; \
                    if [ \$exit_code -eq 124 ]; then \
                    echo '2000' > time.txt; \
                    else \
                    echo \$((end - start)) > time.txt; \
                    fi; \
                    ./customCheck input.txt output.txt answer.txt > result.txt 2>&1 || true"`);

                execSync(`docker cp ${id}:/app/result.txt "${resultPath}"`);
                execSync(`docker cp ${id}:/app/output.txt "${outputPath}"`);
                execSync(`docker cp ${id}:/app/time.txt "${timePath}"`);
                execSync(`docker cp ${id}:/app/exitCode.txt "${exitCodePath}"`);

                const exitCodeRaw = fs.readFileSync(exitCodePath, 'utf-8').trim();
                const exitCode = parseInt(exitCodeRaw);

                const result = fs.readFileSync(outputPath, 'utf-8').trim();

                let timeUsed = 0;
                let status = "";
                let checkerLogs = "";

                if (exitCode === 124) {
                    checkerLogs = "Time Limit Exceeded";
                    status = "Time Limit Exceeded";
                    timeUsed = timeLimit * 1000;
                } else if (exitCode !== 0) {
                    checkerLogs = "Runtime Error";
                    status = "Runtime Error";
                    timeUsed = 0;
                } else {
                    let timeUsedRaw = fs.readFileSync(timePath, 'utf-8').trim();
                    timeUsed = parseFloat(timeUsedRaw);
                    if (isNaN(timeUsed)) {
                        timeUsed = 0;
                    } else {
                        timeUsed = Math.min(timeLimit * 1000, timeUsed);
                    }
                    checkerLogs = fs.readFileSync(resultPath, 'utf-8').trim();
                }
                const firstLine = checkerLogs.split('\n')[0].toLowerCase();
                runtime += timeUsed;

                if(status==="Time Limit Exceeded" || status==="Runtime Error"){}
                else if (firstLine.startsWith('ok')) {
                    status = "Accepted";
                } else if (firstLine.startsWith('wrong answer')) {
                    status = `Wrong Answer on Testcase ${i + 1}`;
                } else if (firstLine.startsWith('fail')) {
                    status = "Fail";
                } else if (firstLine.startsWith('unexpected eof')) {
                    status = "Unexpected EOF Error";
                } else if (firstLine.startsWith('wrong output format')) {
                    status = "Wrong Output Format";
                } else {
                    status = "Random Verdict";
                }

                verdicts.push({
                    Input: testcases[i].input,
                    Output: (errType===""?result:""),
                    Expected: testcases[i].expected,
                    Verdict:status,
                    checkerLogs: (errType===""?checkerLogs:""),
                    time: timeUsed
                });
                if(status!="Accepted") {
                    overAllStatus=status;
                    break;
                }
            } catch (e) {
                overAllStatus = "Runtime Error or Docker Copy Error on "+(i+1);
                errType="Runtime Error";
                errMessage=e.message;
                break;

            }
        }

        fs.rmSync(jobDir, { recursive: true, force: true });

        testcaseProgress.delete(submissionId);

        return res.json({ status:overAllStatus, time:runtime, errType, errMessage, verdicts });

    } catch (e) {
        return res.json({
            errType: "Backend Error",
            errMessage: e.message
        });
    } finally {
        try {
            if (id) execSync(`docker rm -f ${id}`);
        } catch (e) { }
    }
};

const getProgress = (req, res) => {
    const { submissionId } = req.params;
    const progress = testcaseProgress.get(submissionId) || 0;
    res.json({ runningTestcase: progress });
};

module.exports = { execute, getProgress };