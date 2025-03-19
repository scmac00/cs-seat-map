// Seat Map Application - Refactored to align with Salesforce LWC patterns
// This implementation uses a more structured approach similar to LWC
// while maintaining compatibility with vanilla HTML/JS

document.addEventListener("DOMContentLoaded", function () {
  // ===== DATA TRANSFORMATION MODULE =====
  // This mimics the formatSeatData method in the LWC component
  const DataService = {
    // Transform flat Salesforce data into hierarchical structure
    // similar to the LWC implementation
    transformSalesforceData(rawData) {
      const grouped = {};

      rawData.forEach((seat) => {
        const row = seat["PricebookEntry.Product2.Row"];
        const accountName = seat.Opportunity_Account_Name;
        const opportunityId = seat["Opportunity.Id"] || "";

        if (!grouped[row]) {
          grouped[row] = {
            rowLabel: row,
            accountName: accountName,
            seats: [],
          };
        }

        grouped[row].seats.push({
          seatNumber: parseInt(
            parseFloat(seat["PricebookEntry.Product2.Seat_Number"])
          ),
          day: seat["PricebookEntry.Product2.Day_of_Stampede"],
          event: seat["PricebookEntry.Product2.Event_Type"],
          recordId: seat.Id,
          opportunityId: opportunityId,
          accountName: accountName,
        });
      });

      return Object.values(grouped);
    },

    // Find contiguous segments in an array of numbers
    findContiguousSegments(numbers) {
      if (numbers.length === 0) return [];

      // Sort the numbers
      numbers.sort((a, b) => a - b);

      const segments = [];
      let currentSegment = [numbers[0]];

      for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] === numbers[i - 1] + 1) {
          // Continue the current segment
          currentSegment.push(numbers[i]);
        } else {
          // End the current segment and start a new one
          segments.push([...currentSegment]);
          currentSegment = [numbers[i]];
        }
      }

      // Add the last segment
      segments.push(currentSegment);

      return segments;
    },

    // Process data to identify connected seats
    // This moves the connected seats logic from UI to data layer
    processConnectedSeats(data) {
      const processedData = [];

      data.forEach((row) => {
        // Group seats by opportunity ID to find connected seats
        const seatsByOpportunity = {};

        row.seats.forEach((seat) => {
          const key = seat.opportunityId || `single-${seat.recordId}`;
          if (!seatsByOpportunity[key]) {
            seatsByOpportunity[key] = [];
          }
          seatsByOpportunity[key].push(seat);
        });

        // Process each opportunity group
        const processedRow = {
          rowLabel: row.rowLabel,
          seatGroups: [],
        };

        Object.values(seatsByOpportunity).forEach((opportunitySeats) => {
          // Sort seats by number
          opportunitySeats.sort((a, b) => a.seatNumber - b.seatNumber);

          // Find contiguous segments
          const seatNumbers = opportunitySeats.map((s) => s.seatNumber);
          const segments = this.findContiguousSegments(seatNumbers);

          // Create seat groups for each segment
          segments.forEach((segment) => {
            const segmentSeats = opportunitySeats.filter((s) =>
              segment.includes(s.seatNumber)
            );

            const isConnected = segment.length > 1;
            const firstSeat = segmentSeats[0];

            processedRow.seatGroups.push({
              isConnected: isConnected,
              startSeat: segment[0],
              endSeat: segment[segment.length - 1],
              seatCount: segment.length,
              seats: segmentSeats,
              accountName: firstSeat.accountName,
              day: firstSeat.day,
              event: firstSeat.event,
              opportunityId: firstSeat.opportunityId,
              recordIds: segmentSeats.map((s) => s.recordId),
            });
          });
        });

        processedData.push(processedRow);
      });

      return processedData;
    },
  };

  // ===== STATE MANAGEMENT MODULE =====
  // This mimics the reactive state management in LWC
  const AppState = {
    // Raw data
    seatData: [],

    // Filtered data for display (similar to filteredSeatData in LWC)
    filteredSeatData: [],

    // Processed data with connected seats
    processedData: [],

    // Filter state
    selectedDay: "",
    selectedEvent: "",

    // Selected seat
    selectedSeat: null,

    // Observers for reactive updates
    observers: [],

    // Initialize the state with data
    initialize(rawData) {
      // Transform the raw data into the hierarchical structure
      this.seatData = DataService.transformSalesforceData(rawData);

      // Set initial filters based on available data
      const filterOptions = this.initializeFilters();

      // Apply initial filters
      this.applyFilters();

      return filterOptions;
    },

    // Initialize filters with first available options
    initializeFilters() {
      // Get unique days from the data
      const days = new Set();
      this.seatData.forEach((row) => {
        row.seats.forEach((seat) => {
          days.add(seat.day);
        });
      });

      // Sort days by day number
      const sortedDays = [...days].sort((a, b) => {
        const dayNumA = parseInt(a.split(" ")[1]);
        const dayNumB = parseInt(b.split(" ")[1]);
        return dayNumA - dayNumB;
      });

      // Get unique event types
      const events = new Set();
      this.seatData.forEach((row) => {
        row.seats.forEach((seat) => {
          events.add(seat.event);
        });
      });

      // Sort event types alphabetically
      const sortedEvents = [...events].sort();

      // Set default values
      this.selectedDay = sortedDays.length > 0 ? sortedDays[0] : "";
      this.selectedEvent = sortedEvents.length > 0 ? sortedEvents[0] : "";

      // Return the options for UI creation
      return {
        days: sortedDays,
        events: sortedEvents,
      };
    },

    // Apply filters to the data (similar to applyFilters in LWC)
    applyFilters() {
      console.log("Applying filters:", {
        day: this.selectedDay,
        event: this.selectedEvent,
      });

      // Use the LWC-style filtering approach
      this.filteredSeatData = this.seatData
        .map((row) => {
          // Filter seats based on selected day and event
          const filteredSeats = row.seats.filter((seat) => {
            const dayMatch = !this.selectedDay || seat.day === this.selectedDay;
            const eventMatch =
              !this.selectedEvent || seat.event === this.selectedEvent;
            return dayMatch && eventMatch;
          });

          // Return a new row object with filtered seats
          return {
            ...row,
            seats: filteredSeats,
          };
        })
        .filter((row) => row.seats.length > 0); // Remove empty rows

      console.log("Filtered data:", this.filteredSeatData);

      // Process connected seats
      this.processedData = DataService.processConnectedSeats(
        this.filteredSeatData
      );

      console.log("Processed data:", this.processedData);

      // Clear selected seat when filters change
      this.selectedSeat = null;

      // Notify observers of state change
      this.notifyObservers();
    },

    // Set day filter
    setDay(day) {
      this.selectedDay = day;
      this.applyFilters();
    },

    // Set event filter
    setEvent(event) {
      this.selectedEvent = event;
      this.applyFilters();
    },

    // Set selected seat
    selectSeat(seat) {
      this.selectedSeat = seat;
      this.notifyObservers();
    },

    // Add observer for reactive updates
    addObserver(callback) {
      this.observers.push(callback);
    },

    // Notify all observers of state change
    notifyObservers() {
      this.observers.forEach((callback) => callback(this));
    },

    // Get all unique days
    getDays() {
      const days = new Set();
      this.seatData.forEach((row) => {
        row.seats.forEach((seat) => {
          days.add(seat.day);
        });
      });

      return [...days].sort((a, b) => {
        const dayNumA = parseInt(a.split(" ")[1]);
        const dayNumB = parseInt(b.split(" ")[1]);
        return dayNumA - dayNumB;
      });
    },

    // Get all unique event types
    getEvents() {
      const events = new Set();
      this.seatData.forEach((row) => {
        row.seats.forEach((seat) => {
          events.add(seat.event);
        });
      });

      return [...events].sort();
    },
  };

  // ===== UI RENDERING MODULE =====
  // This handles all DOM manipulation
  const UI = {
    // Initialize the UI
    initialize() {
      this.initializeFilters();
      this.createSeatDetailPanel();
      this.updateSeatingMap();
    },

    // Initialize filter controls that are already in the HTML
    initializeFilters() {
      // Set initial values for filters based on state
      const dayFilterSelect = document.getElementById("day-filter");
      dayFilterSelect.value = AppState.selectedDay;

      const eventTypeRadios = document.querySelectorAll(
        'input[name="event-type"]'
      );
      for (const radio of eventTypeRadios) {
        if (radio.value === AppState.selectedEvent) {
          radio.checked = true;
        }
      }

      // Add event listeners
      dayFilterSelect.addEventListener("change", function () {
        AppState.setDay(this.value);
      });

      eventTypeRadios.forEach((radio) => {
        radio.addEventListener("change", function () {
          if (this.checked) {
            console.log("Radio button changed to:", this.value);
            AppState.setEvent(this.value);
          }
        });
      });
    },

    // Create seat detail panel
    createSeatDetailPanel() {
      const detailPanel = document.createElement("div");
      detailPanel.className = "seat-detail-panel";
      detailPanel.id = "seat-detail-panel";
      detailPanel.innerHTML =
        '<h3>Seat Details</h3><div id="seat-detail-content"></div>';

      // Add to main section, after the seating-container
      const seatingContainer = document.querySelector(".seating-container");
      seatingContainer.parentNode.insertBefore(
        detailPanel,
        seatingContainer.nextSibling
      );
    },

    // Update the seating map with data
    updateSeatingMap() {
      console.log(
        "Updating seating map with processed data:",
        AppState.processedData
      );

      // Reset previously marked seats
      document
        .querySelectorAll(".seat.sold, .connected-seats")
        .forEach((seat) => {
          if (seat.classList.contains("connected-seats")) {
            // If this is a connected seats element, replace it with the original seats
            const row = seat.getAttribute("data-row");
            const startSeat = parseInt(seat.getAttribute("data-start-seat"));
            const endSeat = parseInt(seat.getAttribute("data-end-seat"));

            // Recreate the individual seats
            const seatElements = [];
            for (let i = startSeat; i <= endSeat; i++) {
              const seatElement = document.createElement("div");
              seatElement.className = "seat";
              seatElement.setAttribute("data-seat-id", `${row}${i}`);
              seatElement.textContent = i;
              seatElements.push(seatElement);
            }

            // Replace the connected seats with the original seats
            const parent = seat.parentNode;
            seatElements.forEach((seatEl) => {
              parent.insertBefore(seatEl, seat);
            });
            seat.remove();
          } else {
            // Just a regular sold seat, reset it
            seat.classList.remove("sold");
            seat.removeAttribute("data-sf-id");
            seat.removeAttribute("data-account");
            seat.removeAttribute("data-event-type");
            seat.removeAttribute("data-day");
            seat.removeAttribute("data-opportunity-id");
          }
        });

      // Process each row and its seat groups
      if (AppState.processedData && AppState.processedData.length > 0) {
        AppState.processedData.forEach((row) => {
          if (row.seatGroups && row.seatGroups.length > 0) {
            row.seatGroups.forEach((group) => {
              if (group.isConnected) {
                // Handle connected seats
                this.renderConnectedSeats(row.rowLabel, group);
              } else {
                // Handle individual seat
                this.renderSingleSeat(row.rowLabel, group);
              }
            });
          }
        });
      }

      // Add click handlers to any new individual seats
      this.addSeatClickHandlers();

      // Update seat details if a seat is selected
      if (AppState.selectedSeat) {
        this.updateSeatDetails();
      }
    },

    // Render connected seats
    renderConnectedSeats(rowLabel, group) {
      // Check if the group spans across sections by looking for missing seats
      // This will detect staircases and section breaks
      const seatSegments = this.findSeatSegments(
        rowLabel,
        group.startSeat,
        group.endSeat
      );

      if (seatSegments.length === 0) {
        return; // No valid segments found
      }

      // Process each segment separately
      seatSegments.forEach((segment) => {
        const firstSeatId = `${rowLabel}${segment.start}`;
        const firstSeat = document.querySelector(
          `[data-seat-id="${firstSeatId}"]`
        );

        if (firstSeat) {
          // Remove all seats in the segment except the first
          for (let i = segment.start + 1; i <= segment.end; i++) {
            const seatId = `${rowLabel}${i}`;
            const seatEl = document.querySelector(`[data-seat-id="${seatId}"]`);
            if (seatEl) {
              seatEl.remove();
            }
          }

          // Create the connected seats element
          const connectedElement = document.createElement("div");
          connectedElement.className = "connected-seats";
          connectedElement.setAttribute("data-row", rowLabel);
          connectedElement.setAttribute("data-start-seat", segment.start);
          connectedElement.setAttribute("data-end-seat", segment.end);
          connectedElement.setAttribute("data-account", group.accountName);
          connectedElement.setAttribute("data-day", group.day);
          connectedElement.setAttribute("data-event-type", group.event);
          connectedElement.setAttribute(
            "data-opportunity-id",
            group.opportunityId || ""
          );

          // For segments that are part of a split group, add a special attribute
          if (seatSegments.length > 1) {
            connectedElement.setAttribute("data-split-group", "true");
            connectedElement.setAttribute(
              "data-original-start",
              group.startSeat
            );
            connectedElement.setAttribute("data-original-end", group.endSeat);
            connectedElement.setAttribute(
              "title",
              `${group.accountName} (Part of ${group.startSeat}-${group.endSeat})`
            );
          } else {
            connectedElement.setAttribute(
              "title",
              `${group.accountName} (${segment.start}-${segment.end})`
            );
          }

          // Add the account name
          const nameElement = document.createElement("div");
          nameElement.className = "account-name";
          nameElement.textContent = group.accountName;
          connectedElement.appendChild(nameElement);

          // Set the grid column span
          const seatSpan = segment.end - segment.start + 1;
          connectedElement.style.gridColumn = `span ${seatSpan}`;

          // Add click event
          connectedElement.addEventListener("click", function () {
            // Remove active class from all seats
            document
              .querySelectorAll(".seat.active, .connected-seats.active")
              .forEach((s) => {
                s.classList.remove("active");
              });

            // Add active class to clicked element
            this.classList.add("active");

            // If this is part of a split group, use the original group data
            const startSeat =
              this.getAttribute("data-original-start") ||
              this.getAttribute("data-start-seat");
            const endSeat =
              this.getAttribute("data-original-end") ||
              this.getAttribute("data-end-seat");
            const seatCount = parseInt(endSeat) - parseInt(startSeat) + 1;

            // Set selected seat to this connected segment
            AppState.selectSeat({
              isConnected: true,
              accountName: this.getAttribute("data-account"),
              row: this.getAttribute("data-row"),
              startSeat: startSeat,
              endSeat: endSeat,
              seatCount: seatCount,
              day: this.getAttribute("data-day"),
              eventType: this.getAttribute("data-event-type"),
              opportunityId: this.getAttribute("data-opportunity-id"),
              status: "sold",
            });
          });

          // Replace the first seat with the connected element
          firstSeat.parentNode.replaceChild(connectedElement, firstSeat);
        }
      });
    },

    // Find valid seat segments that don't cross staircases or pillars
    findSeatSegments(rowLabel, startSeat, endSeat) {
      const segments = [];

      // First, collect all existing seats in the range with their parent sections
      const existingSeats = [];
      for (let i = startSeat; i <= endSeat; i++) {
        const seatId = `${rowLabel}${i}`;
        const seatEl = document.querySelector(`[data-seat-id="${seatId}"]`);

        if (seatEl) {
          // Find the parent section of this seat
          let parentSection = seatEl.closest(".seat-section");

          existingSeats.push({
            seatNumber: i,
            element: seatEl,
            section: parentSection,
          });
        }
      }

      // Group seats by their parent section
      const seatsBySection = {};
      existingSeats.forEach((seat) => {
        const sectionId = seat.section
          ? seat.section.getAttribute("data-section-id") ||
            Array.from(seat.section.parentNode.children).indexOf(seat.section)
          : "unknown";

        if (!seatsBySection[sectionId]) {
          seatsBySection[sectionId] = [];
        }
        seatsBySection[sectionId].push(seat);
      });

      // Create segments for each section, ensuring seats in different sections are separate
      Object.values(seatsBySection).forEach((sectionSeats) => {
        if (sectionSeats.length === 0) return;

        // Sort seats by number within each section
        sectionSeats.sort((a, b) => a.seatNumber - b.seatNumber);

        let currentSegment = null;

        // Create segments of consecutive seats within this section
        sectionSeats.forEach((seat) => {
          if (!currentSegment) {
            currentSegment = { start: seat.seatNumber, end: seat.seatNumber };
          } else if (seat.seatNumber === currentSegment.end + 1) {
            // Extend current segment if seats are consecutive
            currentSegment.end = seat.seatNumber;
          } else {
            // Start a new segment if there's a gap
            segments.push(currentSegment);
            currentSegment = { start: seat.seatNumber, end: seat.seatNumber };
          }
        });

        // Add the last segment
        if (currentSegment) {
          segments.push(currentSegment);
        }
      });

      return segments;
    },

    // Render a single seat
    renderSingleSeat(rowLabel, group) {
      const seatId = `${rowLabel}${group.startSeat}`;
      const seatElement = document.querySelector(`[data-seat-id="${seatId}"]`);

      if (seatElement) {
        // Mark as sold
        seatElement.classList.add("sold");

        // Store data as attributes
        seatElement.setAttribute("data-sf-id", group.recordIds[0] || "");
        seatElement.setAttribute("data-account", group.accountName);
        seatElement.setAttribute("data-event-type", group.event);
        seatElement.setAttribute("data-day", group.day);
        seatElement.setAttribute(
          "data-opportunity-id",
          group.opportunityId || ""
        );
      }
    },

    // Add click event listeners to seats
    addSeatClickHandlers() {
      // We no longer add click handlers to available seats
      // Only sold seats and connected seats can be clicked

      const soldSeats = document.querySelectorAll(".seat.sold");

      soldSeats.forEach((seat) => {
        seat.addEventListener("click", function () {
          // Remove active class from all elements
          document
            .querySelectorAll(".seat.active, .connected-seats.active")
            .forEach((s) => {
              s.classList.remove("active");
            });

          // Add active class to clicked seat
          this.classList.add("active");

          // Store selected seat data
          const seatId = this.getAttribute("data-seat-id");
          const row = seatId.charAt(0);
          const seatNumber = seatId.slice(1);

          AppState.selectSeat({
            seatId: seatId,
            row: row,
            seatNumber: seatNumber,
            account: this.getAttribute("data-account"),
            eventType: this.getAttribute("data-event-type"),
            day: this.getAttribute("data-day"),
            sfId: this.getAttribute("data-sf-id"),
            opportunityId: this.getAttribute("data-opportunity-id") || "",
            status: "sold",
          });
        });
      });
    },

    // Update seat details display
    updateSeatDetails() {
      const detailContent = document.getElementById("seat-detail-content");
      const selectedSeat = AppState.selectedSeat;

      if (!selectedSeat) {
        detailContent.innerHTML = "<p>Select a group to view details</p>";
        return;
      }

      let html = "";

      if (selectedSeat.isConnected) {
        // Connected seats details
        html += `<div class="detail-row"><span class="detail-label">Account:</span>${selectedSeat.accountName}</div>`;
        html += `<div class="detail-row"><span class="detail-label">Row:</span>${selectedSeat.row}</div>`;
        html += `<div class="detail-row"><span class="detail-label">Seats:</span>${selectedSeat.startSeat} - ${selectedSeat.endSeat} (${selectedSeat.seatCount} seats)</div>`;
        html += `<div class="detail-row"><span class="detail-label">Day:</span>${selectedSeat.day}</div>`;
        html += `<div class="detail-row"><span class="detail-label">Event Type:</span>${selectedSeat.eventType}</div>`;

        if (selectedSeat.opportunityId) {
          html += `<div class="detail-row"><span class="detail-label">Opportunity ID:</span>${selectedSeat.opportunityId}</div>`;
        }
      } else {
        // Individual sold seat information
        html += `<div class="detail-row"><span class="detail-label">Row:</span>${selectedSeat.row}</div>`;
        html += `<div class="detail-row"><span class="detail-label">Seat Number:</span>${selectedSeat.seatNumber}</div>`;
        html += `<div class="detail-row"><span class="detail-label">Day:</span>${selectedSeat.day}</div>`;
        html += `<div class="detail-row"><span class="detail-label">Status:</span><span class="sold-badge">Sold</span></div>`;
        html += `<div class="detail-row"><span class="detail-label">Event Type:</span>${selectedSeat.eventType}</div>`;
        html += `<div class="detail-row"><span class="detail-label">Account:</span>${selectedSeat.account}</div>`;
        html += `<div class="detail-row"><span class="detail-label">Record ID:</span>${selectedSeat.sfId}</div>`;

        if (selectedSeat.opportunityId) {
          html += `<div class="detail-row"><span class="detail-label">Opportunity ID:</span>${selectedSeat.opportunityId}</div>`;
        }
      }

      detailContent.innerHTML = html;
    },
  };

  // ===== APPLICATION INITIALIZATION =====
  // Initialize the application
  function initializeApp() {
    console.log(
      "Initializing application with SALESFORCE_DATA:",
      SALESFORCE_DATA
    );

    // Initialize state with data
    AppState.initialize(SALESFORCE_DATA);

    // Initialize UI
    UI.initialize();

    // Add observer for seat details updates
    AppState.addObserver(function (state) {
      UI.updateSeatDetails();
    });

    // Add observer for updating the seating map
    AppState.addObserver(function (state) {
      UI.updateSeatingMap();
    });
  }

  // Start the application
  initializeApp();
});
