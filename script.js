document.addEventListener('DOMContentLoaded', function() {
    // Initialize the seating chart to display group bookings
    displayGroupBookings();
    
    function displayGroupBookings() {
        const groupBookings = GROUP_BOOKINGS_DATA.groupBookings;
        
        // Track which seats are part of groups
        const groupedSeats = new Map();
        
        // First pass: map out which seats belong to groups
        groupBookings.forEach(group => {
            group.seatLocations.forEach(seatId => {
                groupedSeats.set(seatId, group.groupName);
            });
        });
        
        // Second pass: identify contiguous ranges within each row
        const rowRanges = new Map(); // Maps row letters to arrays of ranges
        
        // Group seats by row and find ranges
        groupBookings.forEach(group => {
            const seatsByRow = {};
            
            // Sort seats into rows
            group.seatLocations.forEach(seatId => {
                const rowLetter = seatId.charAt(0);
                const seatNumber = parseInt(seatId.slice(1));
                
                if (!seatsByRow[rowLetter]) {
                    seatsByRow[rowLetter] = [];
                }
                
                seatsByRow[rowLetter].push({
                    seatNumber: seatNumber,
                    seatId: seatId,
                    groupName: group.groupName
                });
            });
            
            // Process each row
            Object.keys(seatsByRow).forEach(rowLetter => {
                if (!rowRanges.has(rowLetter)) {
                    rowRanges.set(rowLetter, []);
                }
                
                // Sort seats by number
                const seats = seatsByRow[rowLetter].sort((a, b) => a.seatNumber - b.seatNumber);
                
                // Find contiguous ranges
                let currentRange = [seats[0]];
                
                for (let i = 1; i < seats.length; i++) {
                    const prevSeat = seats[i-1];
                    const currSeat = seats[i];
                    
                    if (currSeat.seatNumber === prevSeat.seatNumber + 1 && 
                        currSeat.groupName === prevSeat.groupName) {
                        // Continue the current range
                        currentRange.push(currSeat);
                    } else {
                        // End the current range and start a new one
                        if (currentRange.length > 0) {
                            rowRanges.get(rowLetter).push({
                                start: currentRange[0].seatNumber,
                                end: currentRange[currentRange.length - 1].seatNumber,
                                groupName: currentRange[0].groupName,
                                seats: currentRange.map(s => s.seatId)
                            });
                        }
                        
                        currentRange = [currSeat];
                    }
                }
                
                // Add the last range
                if (currentRange.length > 0) {
                    rowRanges.get(rowLetter).push({
                        start: currentRange[0].seatNumber,
                        end: currentRange[currentRange.length - 1].seatNumber,
                        groupName: currentRange[0].groupName,
                        seats: currentRange.map(s => s.seatId)
                    });
                }
            });
        });
        
        // Now apply the changes to the DOM
        rowRanges.forEach((ranges, rowLetter) => {
            // Process each range for this row
            ranges.forEach(range => {
                // Replace the first seat with a group element
                const firstSeatId = `${rowLetter}${range.start}`;
                const firstSeat = document.querySelector(`[data-seat-id="${firstSeatId}"]`);
                
                if (!firstSeat) return;
                
                // Create the group booking element
                const groupElement = document.createElement('div');
                groupElement.className = 'group-booking';
                groupElement.setAttribute('data-group-name', range.groupName);
                groupElement.setAttribute('title', `Group: ${range.groupName}`);
                
                // Add the group name
                const nameElement = document.createElement('div');
                nameElement.className = 'group-name';
                nameElement.textContent = range.groupName;
                groupElement.appendChild(nameElement);
                
                // Set the grid column span
                const seatSpan = range.end - range.start + 1;
                groupElement.style.gridColumn = `span ${seatSpan}`;
                
                // Replace the first seat with the group element
                firstSeat.parentNode.replaceChild(groupElement, firstSeat);
                
                // Remove the remaining seats in the range
                for (let seatNum = range.start + 1; seatNum <= range.end; seatNum++) {
                    const seatId = `${rowLetter}${seatNum}`;
                    const seat = document.querySelector(`[data-seat-id="${seatId}"]`);
                    if (seat) {
                        seat.remove();
                    }
                }
            });
        });
    }
});