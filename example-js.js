import { LightningElement, track, wire } from "lwc";
import getSeatData from "@salesforce/apex/LogeSeatController.getSeatData";

export default class LogeSeatMap extends LightningElement {
  @track seatData = []; // Stores raw data from Apex
  @track filteredSeatData = []; // Stores filtered data for display
  @track selectedDay = "";
  @track selectedEvent = "";

  dayOptions = [
    { label: "Day 1 - Friday", value: "Day 1 - Friday" },
    { label: "Day 2 - Saturday", value: "Day 2 - Saturday" },
    { label: "Day 3 - Sunday", value: "Day 3 - Sunday" },
    { label: "Day 4 - Monday", value: "Day 4 - Monday" },
    { label: "Day 5 - Tuesday", value: "Day 5 - Tuesday" },
    { label: "Day 6 - Wednesday", value: "Day 6 - Wednesday" },
    { label: "Day 7 - Thursday", value: "Day 7 - Thursday" },
    { label: "Day 8 - Friday", value: "Day 8 - Friday" },
    { label: "Day 9 - Saturday", value: "Day 9 - Saturday" },
    { label: "Day 10 - Sunday", value: "Day 10 - Sunday" },
  ];

  eventOptions = [
    { label: "Rodeo", value: "Rodeo" },
    { label: "Evening Show", value: "Evening Show" },
  ];

  @wire(getSeatData)
  wiredSeatData({ error, data }) {
    if (data) {
      console.log("Raw Data from Apex:", JSON.stringify(data));
      this.seatData = this.formatSeatData(data);
      this.filteredSeatData = [...this.seatData]; // Initialize with full data
    } else if (error) {
      console.error("Error fetching seat data:", error);
    }
  }

  formatSeatData(data) {
    let grouped = {};
    data.forEach((seat) => {
      let row = seat.PricebookEntry.Product2.Row__c;
      if (!grouped[row]) {
        grouped[row] = {
          rowLabel: row,
          accountName: seat.Opportunity.Account.Name,
          seats: [],
        };
      }
      grouped[row].seats.push({
        seatNumber: seat.PricebookEntry.Product2.Seat_Number__c,
        day: seat.PricebookEntry.Product2.Day_of_Stampede__c,
        event: seat.PricebookEntry.Product2.Event_Type__c,
      });
    });
    return Object.values(grouped);
  }

  handleDayChange(event) {
    this.selectedDay = event.detail.value;
    console.log("Selected Day:", this.selectedDay);
    this.applyFilters();
  }

  handleEventChange(event) {
    this.selectedEvent = event.detail.value;
    console.log("Selected Event:", this.selectedEvent);
    this.applyFilters();
  }

  applyFilters() {
    console.log("Applying Filters: ", this.selectedDay, this.selectedEvent);
    this.filteredSeatData = this.seatData
      .map((row) => ({
        ...row,
        seats: row.seats.filter(
          (seat) =>
            (!this.selectedDay || seat.day === this.selectedDay) &&
            (!this.selectedEvent || seat.event === this.selectedEvent)
        ),
      }))
      .filter((row) => row.seats.length > 0); // Remove empty rows
  }
}
