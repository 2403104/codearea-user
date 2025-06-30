import React, { useContext, useEffect,useState } from 'react'
import ProblemContext from '../../myContext/problem/ProblemContext';
import ContestNavbar from './ContestNavbar';
const ContestMainPage = () => {
    const { setShowNavbar } = useContext(ProblemContext);
    const [contest, setContest] = useState(null);
    const [problems, setProblems] = useState(null);
    const fetchContest = async () => {
        const url = 'http://localhost:3001/user/get-contest/685b70979b7d13d02e196604';
        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                setContest(data.contest);
                setProblems(data.contest.problems);
            } else {
                console.error('Failed to fetch contest:', data.error);
            }
        } catch (err) {
            console.error('Fetch error:', err);
        }
    };
    useEffect(()=>{
        fetchContest();
    },[])
    return (
        <>
            <ContestNavbar />
            This is Main Contest Page.
        </>
    )
}

export default ContestMainPage
