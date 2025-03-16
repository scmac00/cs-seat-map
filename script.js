document.addEventListener('DOMContentLoaded', function() {
    // State management
    let selectedSeats = [];
    
    // Initialize seats with click events
    initializeSeats();
    
    // Initialize seats with click events
    function initializeSeats() {
        const seats = document.querySelectorAll('.seat');
        
        seats.forEach(seat => {
            const seatId = seat.getAttribute('data-seat-id');
            
            // Add click event for selection
            seat.addEventListener('click', function() {
                toggleSeatSelection(seatId, seat);
            });
        });
    }
    
    // Toggle seat selection
    function toggleSeatSelection(seatId, seatElement) {
        if (selectedSeats.includes(seatId)) {
            // Deselect the seat
            selectedSeats = selectedSeats.filter(id => id !== seatId);
            seatElement.classList.remove('selected');
        } else {
            // Select the seat
            selectedSeats.push(seatId);
            seatElement.classList.add('selected');
        }
        
        console.log('Selected seats:', selectedSeats);
    }
});